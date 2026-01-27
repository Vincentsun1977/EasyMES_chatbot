"""FastAPI application entry point."""
import sys
import os
import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import chat, health

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.APP_DEBUG else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Dify Chatbot API",
    description="API service for Dify-powered chatbot with iframe support",
    version="1.0.0",
    debug=settings.APP_DEBUG,
    root_path="/easymes"
)

# Configure CORS for iframe embedding
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(health.router, tags=["Health"])
app.include_router(chat.router, prefix="/api/v1", tags=["Chat"])

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/")
async def root():
    """Serve the chatbot UI."""
    return FileResponse("app/static/index.html")


@app.on_event("startup")
async def startup_event():
    """Application startup event."""
    logger.info("Starting Dify Chatbot API")
    logger.info(f"Dify API URL: {settings.DIFY_API_URL}")
    logger.info(f"CORS Origins: {settings.cors_origins}")


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event."""
    logger.info("Shutting down Dify Chatbot API")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=settings.APP_DEBUG
    )
