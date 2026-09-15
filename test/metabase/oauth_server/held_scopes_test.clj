(ns metabase.oauth-server.held-scopes-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.oauth-server.held-scopes :as held-scopes]))

(defn- client [client-id client-name & redirect-uris]
  {:client_id client-id :client_name client-name :redirect_uris (vec redirect-uris)})

(deftest same-app-by-client-id-test
  (testing "GHY-4555: the same client_id is the same app, whatever its name or redirects"
    (is (held-scopes/same-app? (client "a" "Claude Code (mb)" "http://localhost:1/callback")
                               (client "a" nil "https://example.com/other"))))
  (testing "two clients with no client_id are not the same app"
    (is (not (held-scopes/same-app? (client nil nil) (client nil nil))))))

(deftest same-app-by-https-redirect-test
  (testing "GHY-4555: an https redirect matches only the exact same string, and the client name plays no part"
    (is (held-scopes/same-app? (client "a" "Claude" "https://claude.ai/api/mcp/auth_callback")
                               (client "b" "Claude for Work" "https://claude.ai/api/mcp/auth_callback")))
    (is (held-scopes/same-app? (client "a" nil "https://chatgpt.com/connector/oauth/abc")
                               (client "b" nil "https://example.com/x" "https://chatgpt.com/connector/oauth/abc")))
    (doseq [other ["https://claude.ai/api/mcp/auth_callback/"
                   "https://claude.ai:8443/api/mcp/auth_callback"
                   "https://claude.ai/api/mcp/auth_callback?x=1"
                   "http://claude.ai/api/mcp/auth_callback"]]
      (testing other
        (is (not (held-scopes/same-app? (client "a" "Claude" "https://claude.ai/api/mcp/auth_callback")
                                        (client "b" "Claude" other))))))))

(deftest same-app-by-loopback-redirect-test
  (testing "GHY-4555: a loopback redirect matches on host, path and client name, ignoring the port"
    (doseq [[a b] [["http://localhost:33418/callback" "http://localhost:51234/callback"]
                   ["http://127.0.0.1:1455/callback/tok" "http://127.0.0.1:61000/callback/tok"]
                   ["http://[::1]:1/cb" "http://[::1]:2/cb"]
                   ["http://localhost/callback" "http://localhost:8080/callback"]]]
      (testing (str a " ~ " b)
        (is (held-scopes/same-app? (client "a" "Claude Code (mb)" a) (client "b" "Claude Code (mb)" b))))))
  (testing "but not when anything other than the port differs"
    (doseq [[a b] [["http://localhost:1/callback" "http://127.0.0.1:1/callback"]
                   ["http://localhost:1/callback" "http://localhost:1/callback/other"]
                   ["http://127.0.0.1:1/callback/tok-a" "http://127.0.0.1:2/callback/tok-b"]]]
      (testing (str a " vs " b)
        (is (not (held-scopes/same-app? (client "a" "Codex" a) (client "b" "Codex" b)))))))
  (testing "a loopback path like `/callback` is generic, so a different or missing client name never matches"
    (is (not (held-scopes/same-app? (client "a" "Claude Code (mb)" "http://localhost:1/callback")
                                    (client "b" "Other Tool" "http://localhost:2/callback"))))
    (is (not (held-scopes/same-app? (client "a" nil "http://localhost:1/callback")
                                    (client "b" nil "http://localhost:2/callback"))))
    (is (not (held-scopes/same-app? (client "a" "" "http://localhost:1/callback")
                                    (client "b" "" "http://localhost:1/callback"))))))

(deftest same-app-never-by-name-alone-test
  (testing "GHY-4555: the same name with unrelated redirects is not the same app"
    (is (not (held-scopes/same-app? (client "a" "Claude" "https://claude.ai/api/mcp/auth_callback")
                                    (client "b" "Claude" "https://example.com/callback")))))
  (testing "a custom-scheme redirect only matches through the client_id"
    (is (not (held-scopes/same-app? (client "a" "Cursor" "cursor://anysphere.cursor-mcp/oauth/callback")
                                    (client "b" "Cursor" "cursor://anysphere.cursor-mcp/oauth/callback"))))))

(deftest declined-scopes-test
  (testing "GHY-4555: declined is the offered scopes the app already holds that the user left unticked, in offered order"
    (is (= ["agent:content:write"]
           (held-scopes/declined-scopes ["agent:content:read" "agent:content:write" "agent:sql:run"]
                                        #{"agent:content:read" "agent:content:write" "agent:delivery:write"}
                                        ["agent:content:read" "agent:sql:run"]))))
  (testing "a held scope that was not offered is never declined"
    (is (empty? (held-scopes/declined-scopes ["agent:content:read"]
                                             #{"agent:content:read" "agent:sql:run"}
                                             ["agent:content:read"]))))
  (testing "an unticked scope the app does not hold is not declined"
    (is (empty? (held-scopes/declined-scopes ["agent:content:read" "agent:sql:run"]
                                             #{"agent:content:read"}
                                             ["agent:content:read"])))))

(deftest narrowed-scope-test
  (testing "GHY-4555: narrowing removes exactly the declined scope strings and keeps the rest in order"
    (is (= ["agent:content:read" "agent:sql:run"]
           (held-scopes/narrowed-scope ["agent:content:read" "agent:content:write" "agent:sql:run"]
                                       ["agent:content:write" "agent:delivery:write"]))))
  (testing "a wildcard that covers a declined scope is left alone"
    (is (= ["agent:*" "mb:full"]
           (held-scopes/narrowed-scope ["agent:*" "mb:full"] ["agent:content:write"])))))
