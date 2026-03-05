"""Avatar management endpoints."""
import base64
import pathlib
import sys
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
import logging

try:
    from app.config import settings
except ModuleNotFoundError:
    project_root = pathlib.Path(__file__).resolve().parents[2]
    project_root_str = str(project_root)
    if project_root_str not in sys.path:
        sys.path.insert(0, project_root_str)
    from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)
uvicorn_error_logger = logging.getLogger("uvicorn.error")


def emit_avatar_debug(message: str) -> None:
    logger.warning(message)
    uvicorn_error_logger.warning(message)
    print(message, flush=True)


def build_fallback_avatar_svg(user_id: str) -> bytes:
        """Build a simple SVG fallback avatar from user id."""
        safe_user = (user_id or "U").strip()
        initial = safe_user[0].upper() if safe_user else "U"
        svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>
    <rect width='96' height='96' rx='48' fill='#F3F4F6'/>
    <circle cx='48' cy='36' r='18' fill='#D1D5DB'/>
    <path d='M18 84c4-16 18-24 30-24s26 8 30 24' fill='#D1D5DB'/>
    <text x='48' y='55' text-anchor='middle' font-size='24' font-family='Arial, sans-serif' fill='#6B7280'>{initial}</text>
</svg>"""
        return svg.encode("utf-8")


def build_avatar_url(user_id: str) -> str:
    return f"{settings.ODATA_BASE_URL}/UserPicSet(UserId='{user_id}')/$value"


def build_avatar_headers(cache_control: str, avatar_url: str) -> dict[str, str]:
    return {
        "Cache-Control": cache_control,
        "X-Avatar-Upstream-Url": avatar_url,
        "Access-Control-Expose-Headers": "X-Avatar-Upstream-Url",
    }

@router.get("/avatar")
async def get_user_avatar(request: Request):
    """Fetch avatar from SAP server-side and return image bytes directly."""
    employee_id = request.query_params.get("EmployeeId") or "CNHUSUN"
    encoded_employee_id = quote(employee_id, safe="")
    avatar_url = build_avatar_url(encoded_employee_id)
    debug_url_msg = (
        f"[AVATAR_DEBUG] URL resolved: employee_id={employee_id}, "
        f"encoded_employee_id={encoded_employee_id}, url={avatar_url}"
    )
    emit_avatar_debug(debug_url_msg)

    request_headers = {"Accept": "*/*"}
    if settings.BASIC_USERNAME and settings.BASIC_PASSWORD:
        token = base64.b64encode(f"{settings.BASIC_USERNAME}:{settings.BASIC_PASSWORD}".encode("utf-8")).decode("ascii")
        request_headers["Authorization"] = f"Basic {token}"

    try:
        async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT, verify=settings.VERIFY_SSL) as client:
            response = await client.get(avatar_url, headers=request_headers)
            debug_resp_msg = (
                f"[AVATAR_DEBUG] upstream response: status={response.status_code}, "
                f"content_type={response.headers.get('content-type', '')}, url={avatar_url}"
            )
            emit_avatar_debug(debug_resp_msg)
    except httpx.RequestError as exc:
        logger.warning("Avatar request failed for %s: %s", employee_id, exc)
        return Response(
            content=build_fallback_avatar_svg(employee_id),
            media_type="image/svg+xml",
            headers=build_avatar_headers("public, max-age=300", avatar_url),
        )

    if response.status_code != 200:
        logger.warning("Avatar service returned status %s for %s", response.status_code, employee_id)
        return Response(
            content=build_fallback_avatar_svg(employee_id),
            media_type="image/svg+xml",
            headers=build_avatar_headers("public, max-age=300", avatar_url),
        )

    content_type = response.headers.get("content-type", "")
    if not content_type.lower().startswith("image/"):
        logger.warning(
            "Avatar service did not return image for %s, content-type=%s",
            employee_id,
            content_type,
        )
        return Response(
            content=build_fallback_avatar_svg(employee_id),
            media_type="image/svg+xml",
            headers=build_avatar_headers("public, max-age=300", avatar_url),
        )

    cache_control = response.headers.get("cache-control", "public, max-age=300")
    return Response(
        content=response.content,
        media_type=content_type,
        headers=build_avatar_headers(cache_control, avatar_url),
    )

@router.delete("/avatar")
async def refresh_avatar():
    """Kept for compatibility; no local cache in redirect mode."""
    return {"message": "Avatar uses redirect mode; no local cache."}