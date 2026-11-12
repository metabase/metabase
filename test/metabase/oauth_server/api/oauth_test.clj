(ns metabase.oauth-server.api.oauth-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.mcp.core :as mcp]
   [metabase.oauth-server.api.oauth :as api.oauth]
   [metabase.test :as mt]))

(defn- scopes [s]
  (set (some-> s (str/split #"\s+"))))

(deftest narrow-scope-to-resource-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (let [mcp-uri "http://localhost:3000/api/metabase-mcp"
          v1-uri  "http://localhost:3000/api/mcp"]
      (testing "an alias narrows to the same surface — every MCP path reaches it now, so a
                per-entity scope no tool gates on is dropped rather than carried into the grant"
        (let [narrowed (scopes (api.oauth/narrow-scope-to-resource
                                [v1-uri]
                                "agent:content:read agent:question:create agent:sql:execute agent:query:run"))]
          (is (= #{"agent:content:read" "agent:query:run"} narrowed))))
      (testing "an indicator naming the MCP resource drops scopes that surface does not accept"
        (let [narrowed (scopes (api.oauth/narrow-scope-to-resource
                                [mcp-uri]
                                "agent:content:read agent:question:create agent:sql:execute agent:query:run"))]
          (is (= #{"agent:content:read" "agent:query:run"} narrowed))))
      (testing "GHY-4543: every v2 scope survives narrowing on every alias — otherwise a first connect or a
                step-up for a write scope is stripped at consent"
        (doseq [path (mcp/mcp-endpoint-paths)]
          (testing path
            (is (= (set (mcp/v2-scopes))
                   (scopes (api.oauth/narrow-scope-to-resource
                            [(str "http://localhost:3000" path)] (str/join " " (mcp/v2-scopes)))))))))
      (testing "GHY-4226: `mb:full` is dropped like any other scope the MCP surface does not accept. A
                client naming the MCP resource wants a token for that surface, which accepts none of
                the REST API that scope unlocks."
        (is (= #{"agent:content:read"}
               (scopes (api.oauth/narrow-scope-to-resource
                        [mcp-uri] "mb:full agent:content:read agent:question:create"))))
        (testing "and it is the only thing requested, nothing survives"
          (is (nil? (api.oauth/narrow-scope-to-resource [mcp-uri] "mb:full")))))
      (testing "nil rather than an empty scope when nothing survives, so the caller can refuse the request"
        (is (nil? (api.oauth/narrow-scope-to-resource [mcp-uri] "agent:question:create")))
        (is (nil? (api.oauth/narrow-scope-to-resource nil "agent:content:read"))))
      (testing "blank and missing scopes stay absent rather than becoming an empty parameter"
        (doseq [blank [nil "" "   "]]
          (testing (pr-str blank)
            (is (nil? (api.oauth/narrow-scope-to-resource [mcp-uri] blank)))
            (is (nil? (api.oauth/narrow-scope-to-resource nil blank))))))
      (testing "narrowing only ever removes — a client cannot gain a scope it did not request"
        (let [requested "agent:content:read agent:question:create mb:full"]
          (doseq [resources [[mcp-uri] nil]]
            (testing (pr-str resources)
              (is (every? (scopes requested)
                          (scopes (api.oauth/narrow-scope-to-resource resources requested)))))))))))

(deftest narrow-scope-to-non-mcp-resource-test
  (testing "GHY-4969: a token for anything but the MCP resource is narrowed to everything but the MCP scopes, so a
            REST token can never be used against MCP"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [requested "mb:full agent:content:read agent:question:create agent:sql:run"]
        (doseq [resources [nil
                           []
                           ["http://localhost:3000/api/agent"]
                           "http://localhost:3000/api/agent"
                           ["not-a-uri"]]]
          (testing (pr-str resources)
            (is (= #{"mb:full" "agent:question:create"}
                   (scopes (api.oauth/narrow-scope-to-resource resources requested))))))
        (testing "nothing survives when only MCP scopes are requested"
          (is (nil? (api.oauth/narrow-scope-to-resource nil (str/join " " (mcp/v2-scopes))))))))))

(deftest narrow-scope-to-mixed-resources-test
  (testing "GHY-4969: a token is either for MCP or for the rest of Metabase, so naming both kinds of resource is
            refused rather than silently narrowed to one of them"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (doseq [resources [["http://localhost:3000/api/metabase-mcp" "http://localhost:3000/api/agent"]
                         ["http://localhost:3000/api/agent" "http://localhost:3000/api/mcp"]]]
        (testing (pr-str resources)
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"cannot mix"
               (api.oauth/narrow-scope-to-resource resources "agent:content:read mb:full")))
          (is (= "invalid_scope"
                 (try
                   (api.oauth/narrow-scope-to-resource resources "agent:content:read mb:full")
                   (catch clojure.lang.ExceptionInfo e
                     (:oauth-error (ex-data e)))))))))))

(deftest narrow-scope-to-resource-canonicalization-test
  (testing "resource indicators are compared canonically, not byte-for-byte. Clients disagree on
            trailing slashes, case, and default ports -- a live Claude Code bug appends a trailing
            slash via WHATWG URL -- and a mismatch silently treats the MCP resource as a REST one.
            RFC 3986 makes scheme and host case-insensitive and the default port elidable; the path is
            neither."
    (let [requested "agent:content:read agent:question:create"
          as-mcp    "agent:content:read"
          as-rest   "agent:question:create"]
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (doseq [indicator ["http://localhost:3000/api/metabase-mcp"
                           "http://localhost:3000/api/metabase-mcp/"
                           "HTTP://LOCALHOST:3000/api/metabase-mcp"
                           "http://LocalHost:3000/api/metabase-mcp/"]]
          (testing (str "matches " (pr-str indicator))
            (is (= as-mcp (api.oauth/narrow-scope-to-resource [indicator] requested))))))
      (testing "the default port is elidable in both directions"
        (mt/with-temporary-setting-values [site-url "https://example.com"]
          (doseq [indicator ["https://example.com/api/metabase-mcp"
                             "https://example.com:443/api/metabase-mcp"]]
            (testing (str "matches " (pr-str indicator))
              (is (= as-mcp (api.oauth/narrow-scope-to-resource [indicator] requested))))))
        (mt/with-temporary-setting-values [site-url "http://example.com"]
          (is (= as-mcp (api.oauth/narrow-scope-to-resource
                         ["http://example.com:80/api/metabase-mcp"] requested)))))
      (testing "canonicalization does not make unrelated resources match"
        (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
          (doseq [indicator ["http://localhost:3000/api/metabase-mcp/extra"
                             "http://localhost:3000/API/METABASE-MCP/V2"
                             "http://localhost:3001/api/metabase-mcp"
                             "https://localhost:3000/api/metabase-mcp"
                             "http://evil.example.com/api/metabase-mcp"
                             "not-a-uri"]]
            (testing (str "treated as non-MCP: " (pr-str indicator))
              (is (= as-rest (api.oauth/narrow-scope-to-resource [indicator] requested))))))))))

(deftest narrow-scope-to-resource-multiple-indicators-test
  (testing "RFC 8707 allows several `resource` indicators. Every MCP path reaches the same v2 surface, so naming
            several of them narrows to that one surface's set, in any order"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [canonical "http://localhost:3000/api/metabase-mcp"
            alias1    "http://localhost:3000/api/mcp"
            requested "mb:full agent:content:read agent:question:create agent:sql:execute"]
        (doseq [indicators [[canonical] [alias1] [canonical alias1] [alias1 canonical]]]
          (testing (pr-str indicators)
            (is (= #{"agent:content:read"}
                   (scopes (api.oauth/narrow-scope-to-resource indicators requested))))))))))

(deftest narrow-scope-to-resource-bare-string-test
  (testing "a lone indicator may arrive as a bare string -- the endpoint schema allows one. `keep` over a
            String iterates characters, none of which canonicalize, so an un-normalized argument would treat
            the MCP resource as a REST one. Narrowing must not depend on the caller having vectorized."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [uri       "http://localhost:3000/api/metabase-mcp"
            requested "mb:full agent:content:read agent:question:create"]
        (is (= (api.oauth/narrow-scope-to-resource [uri] requested)
               (api.oauth/narrow-scope-to-resource uri requested)))
        (is (= "agent:content:read" (api.oauth/narrow-scope-to-resource uri requested)))))))

(deftest narrow-scope-to-resource-underscore-host-test
  (testing "`java.net.URI/getHost` is nil for a host it considers non-conformant -- notably one containing an
            underscore, which is routine for Docker Compose and internal k8s service names, and which
            Metabase's own `u/url?` accepts as a Site URL. Reading the host alone made canonicalization
            return nil on such an instance, so no indicator ever matched the MCP resource."
    (mt/with-temporary-setting-values [site-url "http://metabase_internal:3000"]
      (let [v2        "http://metabase_internal:3000/api/metabase-mcp"
            requested "mb:full agent:content:read agent:question:create"]
        (is (= "agent:content:read" (api.oauth/narrow-scope-to-resource [v2] requested))
            "MCP narrowing still applies when the Site URL host contains an underscore")))
    (testing "canonicalization keeps the properties it had for conformant hosts"
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [requested "agent:content:read agent:question:create"
              as-mcp    "agent:content:read"]
          (testing "userinfo is still stripped rather than compared"
            (is (= as-mcp (api.oauth/narrow-scope-to-resource
                           ["http://user:pass@localhost:3000/api/metabase-mcp"] requested))))
          (testing "host case is still folded and the default port still elided"
            (is (= as-mcp (api.oauth/narrow-scope-to-resource
                           ["HTTP://LocalHost:3000/api/metabase-mcp"] requested)))))))))
