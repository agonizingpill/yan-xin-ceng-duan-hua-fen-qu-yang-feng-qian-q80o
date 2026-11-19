import os,hmac,logging
from contextlib import asynccontextmanager
from fastapi import FastAPI,HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select,text
from sqlalchemy.exc import IntegrityError
from redis import Redis
from .database import Session,Base,engine
from .models import User
from .schemas import Login
from .security import password_hash,token_for
from .middlewares import RequestTrace,Recovery
from scripts.seed_demo import seed
logging.basicConfig(level=logging.INFO)
redis=Redis.from_url(os.environ['REDIS_URL'],decode_responses=True)
def upgrade_schema():
    # create_all 只建新表；旧演示库的新列在此幂等补齐，历史数据升级后照常查看
    from sqlalchemy import inspect,text
    cols={'boreholes':[('area',"VARCHAR(120) DEFAULT ''")],'interpretations':[('mode',"VARCHAR(20) DEFAULT 'gmm'"),('ruler_id','INTEGER')],'strata':[('layer_type',"VARCHAR(40) DEFAULT ''")]}
    inspector=inspect(engine)
    tables=inspector.get_table_names()
    existing={t:{c['name']for c in inspector.get_columns(t)}for t in cols if t in tables}
    with engine.begin()as conn:
        for table,adds in cols.items():
            for name,ddl in adds:
                if name not in existing.get(table,set()):conn.execute(text('ALTER TABLE %s ADD COLUMN %s %s'%(table,name,ddl)))
@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    try:upgrade_schema()
    except Exception:logging.exception('schema upgrade failed')
    if os.getenv('SEED_DEMO','true')=='true':
        try:seed()
        except Exception:logging.exception('seed failed')
    yield
app=FastAPI(title='砾衡 · 岩芯层段与封签簿',lifespan=lifespan);app.add_middleware(RequestTrace);app.add_middleware(Recovery)
from .routes import router
app.include_router(router)
@app.exception_handler(IntegrityError)
async def duplicate(request,e):return JSONResponse({'detail':'编号/深度重复或关联不合法，记录未提交'},status_code=409)
@app.get('/health')
def health():
    with Session()as s:s.execute(text('SELECT 1'))
    return {'status':'ok','redis':redis.ping()}
@app.post('/auth/login')
def login(p:Login):
    with Session()as s:
        u=s.scalar(select(User).where(User.email==p.email))
        if not u or not hmac.compare_digest(u.password,password_hash(p.password)):raise HTTPException(401,'账号或口令不正确')
        return {'token':token_for(u),'role':u.role,'email':u.email}
