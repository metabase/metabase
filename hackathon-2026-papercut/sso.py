"""Google sign-in for the papercuts server, open to verified accounts of one Google Workspace domain."""

import base64
import hashlib
import hmac
import html
import json
import re
import secrets
import threading
import time
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import urlopen

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
ISSUERS = ("accounts.google.com", "https://accounts.google.com")
SESSION = "papercuts_session"
LOGIN = "papercuts_login"
SESSION_SECONDS = 12 * 60 * 60
LOGIN_SECONDS = 10 * 60
# Where to go after signing in: a path on this site, never `//host` or `/\host`.
LOCAL_PATH = re.compile(r"/(?![/\\])[!-~]*")

# The email signed in on the request this thread is answering, for the page header.
signed_in = threading.local()


def account_html():
    email = getattr(signed_in, "email", None)
    return f"<span class='muted'>{html.escape(email)} · <a href='/auth/logout'>Sign out</a></span>" if email else ""


def from_env(environ):
    """Sign-in settings from the environment, or None when GOOGLE_OAUTH_CLIENT_ID is unset."""
    if not environ.get("GOOGLE_OAUTH_CLIENT_ID"):
        return None
    required = ("GOOGLE_OAUTH_CLIENT_SECRET", "PAPERCUTS_SESSION_SECRET", "PAPERCUTS_PUBLIC_URL")
    if missing := [name for name in required if not environ.get(name)]:
        raise SystemExit(f"Google sign-in needs {', '.join(missing)}")
    return GoogleSignIn(environ["GOOGLE_OAUTH_CLIENT_ID"], environ["GOOGLE_OAUTH_CLIENT_SECRET"],
                        environ["PAPERCUTS_SESSION_SECRET"], environ["PAPERCUTS_PUBLIC_URL"],
                        environ.get("PAPERCUTS_ALLOWED_DOMAIN") or "metabase.com",
                        proxy_only=environ.get("PAPERCUTS_SSO_PROXY_ONLY") == "1")


class GoogleSignIn:
    """OpenID Connect sign-in with Google, kept in a signed session cookie for 12 hours."""

    def __init__(self, client_id, client_secret, session_secret, public_url, domain="metabase.com", proxy_only=False):
        self.client_id = client_id
        self.client_secret = client_secret
        self.key = session_secret.encode()
        self.origin = public_url.rstrip("/")
        self.redirect_uri = self.origin + "/auth/callback"
        self.domain = domain.lower()
        self.proxy_only = proxy_only

    def handle(self, handler):
        """Answer /auth/ routes, and requests that need a session but lack one. True when a response was sent."""
        signed_in.email = None
        url = urlsplit(handler.path)
        routes = {"/auth/login": self.login, "/auth/callback": self.callback, "/auth/logout": self.logout}
        if handler.command == "GET" and url.path in routes:
            routes[url.path](handler, {key: values[0] for key, values in parse_qs(url.query).items()})
            return True
        # The reverse proxy sets X-Forwarded-Proto on every request; the rest come from the private network.
        if self.proxy_only and "X-Forwarded-Proto" not in handler.headers:
            return False
        session = self.unsign(SESSION, self.cookie(handler, SESSION))
        if session is None:
            if url.path.startswith("/api/"):
                handler.respond(401, {"error": "Sign in at /auth/login"})
            else:
                handler.respond(302, "", "text/plain", {"Location": "/auth/login?" + urlencode({"next": handler.path})})
            return True
        if handler.command != "GET" and handler.headers.get("Origin") != self.origin:
            handler.respond(403, {"error": f"Writes must come from {self.origin}"})
            return True
        signed_in.email = session["email"]
        return False

    def login(self, handler, params):
        state, nonce = secrets.token_urlsafe(), secrets.token_urlsafe()
        target = params.get("next", "/")
        flow = {"state": state, "nonce": nonce, "next": target if LOCAL_PATH.fullmatch(target) else "/"}
        query = urlencode({"client_id": self.client_id, "redirect_uri": self.redirect_uri, "response_type": "code",
                           "scope": "openid email", "state": state, "nonce": nonce, "hd": self.domain,
                           "prompt": "select_account"})
        self.redirect(handler, f"{AUTHORIZE_URL}?{query}",
                      self.cookie_header(LOGIN, self.sign(LOGIN, flow, LOGIN_SECONDS), LOGIN_SECONDS, "/auth"))

    def callback(self, handler, params):
        flow = self.unsign(LOGIN, self.cookie(handler, LOGIN))
        if flow is None or not hmac.compare_digest(flow["state"].encode(), params.get("state", "").encode()):
            return self.refuse(handler, 400, "This sign-in has expired.")
        if "code" not in params:
            return self.refuse(handler, 403, "Google did not sign you in.")
        try:
            tokens = self.google(TOKEN_URL, {"code": params["code"], "client_id": self.client_id,
                                             "client_secret": self.client_secret, "redirect_uri": self.redirect_uri,
                                             "grant_type": "authorization_code"})
            claims = self.google(f"{TOKENINFO_URL}?{urlencode({'id_token': tokens['id_token']})}")
        except (OSError, ValueError, KeyError):
            return self.refuse(handler, 400, "Google sign-in failed.")
        email = str(claims.get("email", "")).lower()
        if not (claims.get("aud") == self.client_id and claims.get("iss") in ISSUERS
                and int(claims.get("exp", 0)) > time.time() and claims.get("email_verified") in ("true", True)
                and claims.get("hd") == self.domain and email.endswith("@" + self.domain)
                and claims.get("nonce") == flow["nonce"]):
            return self.refuse(handler, 403, f"Only verified @{self.domain} Google accounts can sign in.")
        session = self.sign(SESSION, {"email": email}, SESSION_SECONDS)
        return self.redirect(handler, flow["next"], self.cookie_header(SESSION, session, SESSION_SECONDS, "/"))

    def logout(self, handler, _params):
        handler.respond(200, self.page("Signed out."), "text/html", {"Set-Cookie": self.cookie_header(SESSION, "", 0, "/")})

    def refuse(self, handler, status, message):
        handler.respond(status, self.page(message), "text/html")

    @staticmethod
    def page(message):
        return f"<!doctype html><title>Papercuts</title><p>{html.escape(message)} <a href='/auth/login'>Sign in</a></p>"

    @staticmethod
    def redirect(handler, location, cookie):
        handler.respond(302, "", "text/plain", {"Location": location, "Set-Cookie": cookie})

    @staticmethod
    def google(url, form=None):
        """GET a Google endpoint, or POST it a form, and return its JSON."""
        with urlopen(url, urlencode(form).encode() if form else None, timeout=10) as response:
            return json.load(response)

    def sign(self, name, value, seconds):
        payload = base64.urlsafe_b64encode(json.dumps({**value, "exp": int(time.time()) + seconds}).encode()).decode()
        return f"{payload}.{self.mac(name, payload)}"

    def unsign(self, name, token):
        """What `sign` put in the cookie, or None when the cookie was changed or has expired."""
        payload, _, mac = token.rpartition(".")
        if not hmac.compare_digest(mac.encode(), self.mac(name, payload).encode()):
            return None
        value = json.loads(base64.urlsafe_b64decode(payload))
        return value if value["exp"] > time.time() else None

    def mac(self, name, payload):
        # Signing the cookie's name too keeps a sign-in cookie from passing for a session.
        return hmac.new(self.key, f"{name}.{payload}".encode(), hashlib.sha256).hexdigest()

    def cookie_header(self, name, value, seconds, path):
        secure = "; Secure" if self.origin.startswith("https://") else ""
        return f"{name}={value}; Max-Age={seconds}; Path={path}; HttpOnly; SameSite=Lax{secure}"

    @staticmethod
    def cookie(handler, name):
        for part in "; ".join(handler.headers.get_all("Cookie", [])).split(";"):
            key, _, value = part.strip().partition("=")
            if key == name:
                return value
        return ""
