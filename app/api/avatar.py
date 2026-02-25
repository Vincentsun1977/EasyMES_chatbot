"""Avatar management endpoints."""
from fastapi import APIRouter
from fastapi.responses import RedirectResponse

router = APIRouter()

AVATAR_URL = "https://nas-fiori.abb.com/sap/opu/odata/sap/ZHR_EMP_TERM_SRV/UserPicSet(UserId='CNZHZHA62')/$value"

@router.get("/avatar")
async def get_user_avatar():
    """Redirect avatar request to SAP user picture URL."""
    return RedirectResponse(url=AVATAR_URL, status_code=307)

@router.delete("/avatar")
async def refresh_avatar():
    """Kept for compatibility; no local cache in redirect mode."""
    return {"message": "Avatar uses redirect mode; no local cache."}