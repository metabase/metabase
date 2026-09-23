import base64
import json
import time
import unittest
from urllib.parse import parse_qs, urlencode, urlsplit

import sso
from test_server import HttpCase

PROXIED = {"X-Forwarded-Proto": "https"}


class SignInTest(HttpCase):
    def setUp(self):
        super().setUp()
        self.sign_in = self.handler.sign_in = sso.GoogleSignIn("client", "client-secret", "session-key",
                                                               "https://metaouch.dev", proxy_only=True)
        self.sign_in.google = self.google
        self.google_calls = []

    def google(self, url, form=None):
        self.google_calls.append((url, form))
        if url == sso.TOKEN_URL:
            return {"id_token": "id-token"}
        return {"aud": "client", "iss": "https://accounts.google.com", "exp": str(int(time.time()) + 300),
                "email": "ada@metabase.com", "email_verified": "true", "hd": "metabase.com", **self.claims}

    def sign_in_as(self, target="/papercuts/1", state=None, **claims):
        """Sign in through /auth/login and the callback, with Google vouching for `claims`."""
        _, _, login = self.call("GET", "/auth/login?" + urlencode({"next": target}), headers=PROXIED)
        self.authorize = parse_qs(urlsplit(login.getheader("Location")).query)
        self.claims = {"nonce": self.authorize["nonce"][0], **claims}
        return self.call("GET", f"/auth/callback?code=code&state={state or self.authorize['state'][0]}",
                         headers={**PROXIED, "Cookie": login.getheader("Set-Cookie").split(";")[0]})

    def session(self):
        return self.sign_in_as()[2].getheader("Set-Cookie").split(";")[0]

    def test_the_signed_in_user_claims_and_sees_the_release_button(self):
        self.report("r1")
        headers = {**PROXIED, "Cookie": self.session(), "Origin": "https://metaouch.dev"}
        status, claim, _ = self.call("POST", "/api/papercuts/1/dispatch", {}, headers=headers)
        self.assertEqual((status, claim["actor"], claim["state"]), (201, "ada@metabase.com", "running"))
        page = self.call("GET", "/papercuts/1", headers=headers)[1]
        self.assertIn("claimed by Ada", page)
        self.assertIn(f"data-release='{claim['id']}'>Release</button>", page)

    def test_a_claim_without_a_session_must_name_its_claimant(self):
        self.report("r1")
        status, body, _ = self.call("POST", "/api/papercuts/1/claim", {})
        self.assertEqual((status, body["error"]), (400, "Send claimant, or sign in to claim as yourself"))
        status, claim, _ = self.call("POST", "/api/papercuts/1/claim", {"claimant": "tyler@metabase.com"})
        self.assertEqual((status, claim["actor"]), (201, "tyler@metabase.com"))

    def test_settings_come_from_the_environment(self):
        self.assertIsNone(sso.from_env({"PAPERCUTS_PUBLIC_URL": "https://metaouch.dev"}))
        with self.assertRaisesRegex(SystemExit, "needs GOOGLE_OAUTH_CLIENT_SECRET, PAPERCUTS_SESSION_SECRET$"):
            sso.from_env({"GOOGLE_OAUTH_CLIENT_ID": "client", "PAPERCUTS_PUBLIC_URL": "https://metaouch.dev"})
        sign_in = sso.from_env({"GOOGLE_OAUTH_CLIENT_ID": "client", "GOOGLE_OAUTH_CLIENT_SECRET": "client-secret",
                                "PAPERCUTS_SESSION_SECRET": "session-key", "PAPERCUTS_PUBLIC_URL": "https://metaouch.dev/",
                                "PAPERCUTS_SSO_PROXY_ONLY": "1"})
        self.assertEqual((sign_in.redirect_uri, sign_in.domain, sign_in.proxy_only),
                         ("https://metaouch.dev/auth/callback", "metabase.com", True))

    def test_without_sign_in_nothing_changes(self):
        self.handler.sign_in = None
        self.assertEqual(self.report("r1")[0], 201)
        self.assertEqual(self.call("GET", "/papercuts/1", headers=PROXIED)[0], 200)
        self.assertEqual(self.call("GET", "/auth/login", headers=PROXIED)[0], 404)

    def test_direct_requests_keep_the_api_and_send_pages_to_the_public_url(self):
        self.assertEqual(self.report("r1")[0], 201)
        self.assertEqual(self.call("GET", "/api/papercuts/1")[0], 200)
        for path in ("/", "/papercuts/1?reports_limit=1"):
            with self.subTest(path):
                status, _, response = self.call("GET", path)
                self.assertEqual((status, response.getheader("Location")), (302, "https://metaouch.dev" + path))

    def test_proxied_requests_need_a_session(self):
        status, _, response = self.call("GET", "/papercuts/1?reports_limit=1", headers=PROXIED)
        self.assertEqual((status, response.getheader("Location")),
                         (302, "/auth/login?next=%2Fpapercuts%2F1%3Freports_limit%3D1"))
        self.assertEqual(self.call("GET", "/api/papercuts", headers=PROXIED)[0], 401)
        self.assertEqual(self.call("POST", "/api/papercuts/1/comments", {"body": "Hi"}, PROXIED)[0], 401)
        self.sign_in.proxy_only = False
        self.assertEqual(self.call("GET", "/api/papercuts")[0], 401)

    def test_a_verified_metabase_account_gets_a_session(self):
        status, _, response = self.sign_in_as()
        self.assertEqual((status, response.getheader("Location")), (302, "/papercuts/1"))
        self.assertEqual({key: self.authorize[key] for key in ("client_id", "redirect_uri", "scope", "hd")},
                         {"client_id": ["client"], "redirect_uri": ["https://metaouch.dev/auth/callback"],
                          "scope": ["openid email"], "hd": ["metabase.com"]})
        self.assertEqual(self.google_calls, [
            (sso.TOKEN_URL, {"code": "code", "client_id": "client", "client_secret": "client-secret",
                             "redirect_uri": "https://metaouch.dev/auth/callback", "grant_type": "authorization_code"}),
            (sso.TOKENINFO_URL + "?id_token=id-token", None)])
        cookie = response.getheader("Set-Cookie")
        self.assertRegex(cookie, r"^papercuts_session=[\w=-]+\.[0-9a-f]{64}; Max-Age=43200; Path=/; HttpOnly; "
                                 r"SameSite=Lax; Secure$")
        status, page, _ = self.call("GET", "/", headers={**PROXIED, "Cookie": cookie.split(";")[0]})
        self.assertEqual(status, 200)
        self.assertIn("<a class='account' href='/auth/logout' title='Sign out'>ada@metabase.com</a>", page)
        _, _, response = self.call("GET", "/auth/logout", headers=PROXIED)
        self.assertTrue(response.getheader("Set-Cookie").startswith("papercuts_session=; Max-Age=0; Path=/;"))

    def test_sign_in_only_returns_to_this_site(self):
        for target, location in (("/papercuts/1?reports_limit=1", "/papercuts/1?reports_limit=1"),
                                 ("//evil.example", "/"), ("/\\evil.example", "/"), ("https://evil.example", "/")):
            with self.subTest(target):
                self.assertEqual(self.sign_in_as(target)[2].getheader("Location"), location)

    def test_other_accounts_and_broken_sign_ins_are_refused(self):
        for claims in ({"hd": None}, {"email": "ada@metabase.com.example.org"}, {"email_verified": "false"},
                       {"aud": "another-client"}, {"iss": "https://example.org"}, {"nonce": "another-sign-in"},
                       {"exp": str(int(time.time()) - 1)}):
            with self.subTest(claims):
                status, _, response = self.sign_in_as(**claims)
                self.assertEqual((status, response.getheader("Set-Cookie")), (403, None))
        self.assertEqual(self.sign_in_as(state="forged")[0], 400)
        self.sign_in.google = lambda *_: {}
        self.assertEqual(self.sign_in_as()[:2], (400, "<!doctype html><title>Papercuts</title><p>Google sign-in failed. "
                                                     "<a href='/auth/login'>Sign in</a></p>"))
        self.assertEqual(self.call("GET", "/auth/callback?code=code&state=forged", headers=PROXIED)[0], 400)

    def test_changed_or_expired_sessions_are_refused(self):
        payload, mac = self.session().split("=", 1)[1].rsplit(".", 1)
        forged = base64.urlsafe_b64encode(json.dumps({"email": "eve@metabase.com", "exp": 2 ** 40}).encode()).decode()
        for value in (f"{forged}.{mac}", f"{payload}.{'0' * 64}",
                      self.sign_in.sign(sso.SESSION, {"email": "ada@metabase.com"}, -1),
                      self.sign_in.sign(sso.LOGIN, {"email": "ada@metabase.com"}, 60)):
            with self.subTest(value):
                headers = {**PROXIED, "Cookie": f"papercuts_session={value}"}
                self.assertEqual(self.call("GET", "/api/papercuts", headers=headers)[0], 401)

    def test_session_writes_must_come_from_the_public_url(self):
        self.report("r1")
        headers = {**PROXIED, "Cookie": self.session()}
        for origin, expected in (({}, 403), ({"Origin": "https://evil.example"}, 403),
                                 ({"Origin": "https://metaouch.dev"}, 201)):
            with self.subTest(origin):
                self.assertEqual(self.call("POST", "/api/papercuts/1/comments", {"body": "/pr"},
                                           {**headers, **origin})[0], expected)


if __name__ == "__main__":
    unittest.main()
