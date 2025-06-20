from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os
from pathlib import Path
from dotenv import load_dotenv
import logging
from datetime import datetime
from contextlib import asynccontextmanager

from .database.database import init_db, shutdown_db
from .api.auth import router as auth_router, get_current_user
from .api.agent import router as agent_router
from .api.analyzer import FrustrationAnalyzer

logs_dir = Path(__file__).parent / 'logs'
logs_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(logs_dir / f'api_{datetime.now().strftime("%Y%m%d")}.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    logger.info("Database initialized")
    
    # initialize the frustration analyzer
    try:
        logger.info("Initializing frustration analyzer...")
        app.state.analyzer = FrustrationAnalyzer()
        logger.info("Frustration analyzer initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize frustration analyzer: {e}")
        app.state.analyzer = None
    
    yield
    # Shutdown
    shutdown_db()
    logger.info("Database connections closed")

load_dotenv()

app = FastAPI(lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=os.getenv("AUTH_SECRET_KEY")) 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(agent_router)

@app.get("/me")
def me(user = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
