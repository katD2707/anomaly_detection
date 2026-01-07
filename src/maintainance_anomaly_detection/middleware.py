import os
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from fastapi import Request

REDIS_URL = os.environ.get('REDIS_URL')
redis_client = None
if REDIS_URL:
    try:
        import redis
        redis_client = redis.from_url(REDIS_URL)
    except Exception:
        redis_client = None

RATE_LIMIT_MAX = int(os.environ.get('RATE_LIMIT_MAX', 60))
RATE_LIMIT_WINDOW = int(os.environ.get('RATE_LIMIT_WINDOW', 60))
API_KEY = os.environ.get('MAINTAINANCE_API_KEY')


class APIMiddleware(BaseHTTPMiddleware):
    """Middleware enforcing API key for protected endpoints and rate-limiting.

    Protects paths in `PROTECTED_PATHS` and uses Redis when available.
    """

    PROTECTED_PATHS = ['/analyze']

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # enforce api key for protected paths
        if any(path.startswith(p) for p in self.PROTECTED_PATHS):
            if API_KEY:
                key = request.headers.get('x-api-key') or request.query_params.get('api_key')
                if key != API_KEY:
                    return JSONResponse({'detail': 'invalid api key'}, status_code=401)
            # rate limit
            client_key = (request.headers.get('x-api-key') or request.client.host or 'anon')
            if not self._rate_limit(client_key):
                return JSONResponse({'detail': 'rate limit exceeded'}, status_code=429)
        return await call_next(request)

    def _rate_limit(self, key: str):
        now = int(time.time())
        if redis_client:
            try:
                k = f"rl:{key}:{now // RATE_LIMIT_WINDOW}"
                val = redis_client.incr(k)
                if val == 1:
                    redis_client.expire(k, RATE_LIMIT_WINDOW)
                return val <= RATE_LIMIT_MAX
            except Exception:
                pass
        # simple in-memory fallback
        if not hasattr(self, '_store'):
            self._store = {}
        window = now // RATE_LIMIT_WINDOW
        k = f"{key}:{window}"
        self._store[k] = self._store.get(k, 0) + 1
        return self._store[k] <= RATE_LIMIT_MAX
