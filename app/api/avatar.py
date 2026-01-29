"""Avatar management endpoints."""
import os
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

AVATAR_URL = "https://nas-fiori.abb.com/sap/opu/odata/sap/HCMFAB_COMMON_SRV/EmployeePictureSet(ApplicationId=%27MYTEAMCALENDAR%27,EmployeeId=%2720043671%27)/$value"
AVATAR_PATH = "app/static/user_avatar.jpg"

@router.get("/avatar")
async def get_user_avatar():
    """Get user avatar, download if not cached."""
    # Check if avatar already exists
    if os.path.exists(AVATAR_PATH):
        return FileResponse(AVATAR_PATH, media_type="image/jpeg")
    
    # Download avatar
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(AVATAR_URL)
            response.raise_for_status()
            
            # Save avatar to static folder
            os.makedirs(os.path.dirname(AVATAR_PATH), exist_ok=True)
            with open(AVATAR_PATH, "wb") as f:
                f.write(response.content)
            
            return FileResponse(AVATAR_PATH, media_type="image/jpeg")
            
    except Exception as e:
        # If download fails, return fallback
        fallback_path = "app/static/me.png"
        if os.path.exists(fallback_path):
            return FileResponse(fallback_path, media_type="image/png")
        
        raise HTTPException(status_code=404, detail="Avatar not found")

@router.delete("/avatar")
async def refresh_avatar():
    """Delete cached avatar to force refresh."""
    if os.path.exists(AVATAR_PATH):
        os.remove(AVATAR_PATH)
    return {"message": "Avatar cache cleared"}