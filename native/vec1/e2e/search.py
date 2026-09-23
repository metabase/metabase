"""Search a running e2e instance: python3 search.py "query" ["query" ...]  (env: MB_URL, MB_EMAIL, MB_PASSWORD).

Creates the admin user through the setup API on a fresh instance. Prints the engine and the top hits with their
per-scorer contributions."""
import json, os, sys, urllib.parse, urllib.request

B = os.environ.get("MB_URL", "http://localhost:3055")
EMAIL = os.environ.get("MB_EMAIL", "e2e@example.com")
PASSWORD = os.environ.get("MB_PASSWORD", "E2e-sqlite-vec1-pass!")


def _json(req):
    body = urllib.request.urlopen(req).read()
    return json.loads(body) if body else None


def call(method, path, body=None, session=None):
    headers = {"Content-Type": "application/json"}
    if session:
        headers["X-Metabase-Session"] = session
    data = json.dumps(body).encode() if body is not None else None
    return _json(urllib.request.Request(B + path, method=method, data=data, headers=headers))


def login():
    token = call("GET", "/api/session/properties").get("setup-token")
    if token:  # fresh instance: run the setup wizard
        call("POST", "/api/setup", {"token": token,
                                    "user": {"first_name": "E2E", "last_name": "Admin", "email": EMAIL,
                                             "password": PASSWORD, "site_name": "sqlite e2e"},
                                    "prefs": {"site_name": "sqlite e2e", "site_locale": "en"}})
    return call("POST", "/api/session", {"username": EMAIL, "password": PASSWORD})["id"]


SESSION = None


def session():
    global SESSION
    SESSION = SESSION or login()
    return SESSION


def search(q, **params):
    qs = urllib.parse.urlencode(dict(q=q, **params), doseq=True)
    return call("GET", f"/api/search?{qs}", session=session())


def show(q, n=5, **params):
    r = search(q, **params)
    print(f"\n{q!r} {params or ''} -> engine={r.get('engine')} total={r.get('total')}")
    for d in r["data"][:n]:
        scores = {s["name"]: round(s["contribution"], 2) for s in d.get("scores", []) if s.get("contribution")}
        print(f"   {d['model']:10} {d['name'][:45]:45} {scores}")


if __name__ == "__main__":
    for q in sys.argv[1:] or ["income across american regions",
                              "how happy are shoppers with each kind of merchandise",
                              "price reductions granted every three months",
                              "weather forecast for tomorrow"]:
        show(q)
