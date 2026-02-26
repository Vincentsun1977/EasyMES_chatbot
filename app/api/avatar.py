"""Avatar management endpoints."""
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

router = APIRouter()

AVATAR_URL_TEMPLATE = "https://nas-fiori.abb.com/sap/opu/odata/sap/ZHR_EMP_TERM_SRV/UserPicSet(UserId='{employee_id}')/$value"

@router.get("/avatar")
async def get_user_avatar(request: Request):
    """Redirect avatar request to SAP user picture URL."""
    employee_id = request.query_params.get("EmployeeId") or "CNHUSUN"

    avatar_url = AVATAR_URL_TEMPLATE.format(employee_id=quote(employee_id, safe=""))
    return RedirectResponse(url=avatar_url, status_code=307)

@router.delete("/avatar")
async def refresh_avatar():
    """Kept for compatibility; no local cache in redirect mode."""
    return {"message": "Avatar uses redirect mode; no local cache."}