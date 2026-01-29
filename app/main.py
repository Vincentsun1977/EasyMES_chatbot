"""FastAPI application entry point."""
import sys
import os
import logging
import pathlib
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import chat, health, avatar

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# Configure logging
logging.basicConfig(
    level=logging.INFO,  # Always use INFO level for detailed logging
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
    ]
)

# Set specific loggers to INFO level for detailed API logging
logging.getLogger('app.services.dify_client').setLevel(logging.INFO)
logging.getLogger('app.api.chat').setLevel(logging.INFO)
logging.getLogger('httpx').setLevel(logging.WARNING)  # Reduce httpx noise

logger = logging.getLogger(__name__)

# Static files configuration
static_dir = pathlib.Path(__file__).parent / "static"
logger.info(f"Static directory: {static_dir}")
logger.info(f"Static directory exists: {static_dir.exists()}")
if static_dir.exists():
    logger.info(f"Static files: {list(static_dir.glob('*'))}")

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

# Mount static files BEFORE API routes
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Include API routers
app.include_router(health.router, tags=["Health"])
app.include_router(chat.router, prefix="/api/v1", tags=["Chat"])
app.include_router(avatar.router, prefix="/api/v1", tags=["Avatar"])


@app.get("/")
async def root():
    """Serve the chatbot UI."""
    logger.info("=== HOME PAGE ACCESSED ===")
    return FileResponse(str(static_dir / "index.html"))


@app.get("/test-static")
async def test_static():
    """Test static file access."""
    css_file = static_dir / "chat.css"
    logger.info(f"Testing CSS file: {css_file}")
    logger.info(f"CSS file exists: {css_file.exists()}")
    if css_file.exists():
        with open(css_file, 'r', encoding='utf-8') as f:
            content = f.read()[:200]
            return {"status": "ok", "file": str(css_file), "content_preview": content}
    return {"status": "error", "file": str(css_file)}


@app.get("/static-debug/{filename}")
async def static_debug(filename: str):
    """Debug static file serving."""
    file_path = static_dir / filename
    logger.info(f"Serving static file: {file_path}")
    if file_path.exists():
        return FileResponse(str(file_path))
    return {"error": "File not found", "path": str(file_path)}


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
