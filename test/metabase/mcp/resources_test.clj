(ns metabase.mcp.resources-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.config.core :as config]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [stencil.core :as stencil]))

(set! *warn-on-reflection* true)

(def ^:private private-uri "test://mcp/resources-test/private")
(def ^:private public-uri  "test://mcp/resources-test/public")

;; The registry is process-wide state; the fixture snapshots and restores it around each test.
;; Safe because none of the tests below are marked ^:parallel.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each
  (fn [thunk]
    (let [registry @#'mcp.resources/registry
          snapshot @registry]
      (try
        (mcp.resources/register-resource!
         {:uri         public-uri
          :name        "Public Doc"
          :description "Anyone authenticated can read this."
          :mimeType    "text/plain"
          :render-fn   (constantly "public body")})
        (mcp.resources/register-resource!
         {:uri         private-uri
          :name        "Private Doc"
          :description "Requires the agent:search scope."
          :scope       "agent:search"
          :mimeType    "text/plain"
          :render-fn   (constantly "private body")})
        (thunk)
        (finally
          (reset! registry snapshot))))))

(deftest list-resources-public-and-scoped-test
  (testing "scopeless resources are listed for any caller, including empty scopes"
    (let [uris (set (map :uri (:resources (mcp.resources/list-resources #{}))))]
      (is (contains? uris public-uri))
      (is (not (contains? uris private-uri)))))
  (testing "scoped resources are listed only when the token-scopes match"
    (let [uris (set (map :uri (:resources (mcp.resources/list-resources #{"agent:search"}))))]
      (is (contains? uris public-uri))
      (is (contains? uris private-uri))))
  (testing "::scope/unrestricted token-scopes always match"
    (let [uris (set (map :uri (:resources (mcp.resources/list-resources #{::scope/unrestricted}))))]
      (is (contains? uris public-uri))
      (is (contains? uris private-uri)))))

(deftest read-resource-test
  (testing "scopeless resources render :ok with the contents payload for any caller"
    (is (=? {:status   :ok
             :contents [{:uri      public-uri
                         :mimeType "text/plain"
                         :text     "public body"}]}
            (mcp.resources/read-resource public-uri #{} {}))))
  (testing "scoped resources require a matching token-scope"
    (is (=? {:status :scope-denied}
            (mcp.resources/read-resource private-uri #{"agent:other"} {})))
    (is (=? {:status :ok :contents [{:text "private body"}]}
            (mcp.resources/read-resource private-uri #{"agent:search"} {})))
    (is (=? {:status :ok}
            (mcp.resources/read-resource private-uri #{"agent:*"} {}))))
  (testing "::scope/unrestricted token-scopes match scoped resources"
    (is (=? {:status :ok}
            (mcp.resources/read-resource private-uri #{::scope/unrestricted} {}))))
  (testing "unknown URIs return :not-found regardless of scope"
    (is (=? {:status :not-found}
            (mcp.resources/read-resource "test://nope" #{::scope/unrestricted} {})))))

(deftest builtin-construct-query-resource-test
  (testing "the construct-query reference is registered as a public markdown resource"
    (is (=? {:uri      "metabase://docs/construct-query.md"
             :mimeType "text/markdown"
             :name     "Construct Query Reference"}
            (some #(when (= "metabase://docs/construct-query.md" (:uri %)) %)
                  (:resources (mcp.resources/list-resources #{})))))))

(deftest builtin-ui-resource-prefers-border-test
  (testing "the visualize query UI resource explicitly asks the host to provide a border"
    (mcp.resources/with-fallback-template
      (is (=? {:status   :ok
               :contents [{:uri      "ui://metabase/visualize-query.html"
                           :mimeType "text/html;profile=mcp-app"
                           :_meta    {:ui {:prefersBorder true}}}]}
              (mcp.resources/read-resource "ui://metabase/visualize-query.html"
                                           #{"agent:viz:mcp-ui:query"}
                                           {}))))))

(deftest drill-through-ui-resource-is-distinct-from-visualize-query-test
  (testing "render_drill_through has its own UI resource URI (ChatGPT dedupes the iframe by `_meta.ui.resourceUri`; sharing the URI prevents a fresh widget from mounting on drill)"
    (let [uris (set (map :uri (:resources (mcp.resources/list-resources #{"agent:viz:*"}))))]
      (is (contains? uris "ui://metabase/visualize-query.html"))
      (is (contains? uris "ui://metabase/render-drill-through.html"))))
  (testing "the two UI resources return byte-distinct HTML (ChatGPT's asset CDN appears to dedupe by body hash, so identical bodies cause the second asset to silently 404)"
    (mcp.resources/with-fallback-template
      (let [viz-html   (-> (mcp.resources/read-resource "ui://metabase/visualize-query.html"
                                                        #{"agent:viz:mcp-ui:query"} {})
                           :contents first :text)
            drill-html (-> (mcp.resources/read-resource "ui://metabase/render-drill-through.html"
                                                        #{"agent:viz:mcp-ui:drill-through"} {})
                           :contents first :text)]
        (is (string? viz-html))
        (is (string? drill-html))
        (is (not= viz-html drill-html)
            "visualize-query and render-drill-through HTML must differ byte-wise")))))

(deftest builtin-visualize-query-ui-resource-metadata-test
  (testing "the visualize_query UI resource publishes bare origins; :domain is gated on the ChatGPT client"
    ;; site-url is set with a subpath to confirm `_meta.ui.domain` and the CSP domain lists strip the
    ;; path — ChatGPT's MCP host treats those fields as origins and would otherwise reject the value.
    ;; `:domain` itself is only emitted for ChatGPT — Claude validates it against its own
    ;; `*.claudemcpcontent.com` namespace and rejects anything else, so the field is suppressed for
    ;; non-ChatGPT clients (detected via the in-flight request's User-Agent header).
    (let [site-url "https://metabase.example.com/sub/path"
          origin   "https://metabase.example.com"
          uri      "ui://metabase/visualize-query.html"
          read-ui  (fn []
                     (mcp.resources/with-fallback-template
                       (mcp.resources/read-resource uri #{"agent:viz:mcp-ui:query"} {})))]
      (with-redefs [system/site-url (constantly site-url)]
        (testing "no request bound → CSP origins still emitted, :domain suppressed"
          (with-redefs [config/is-dev? false]
            (let [ui-meta (-> (read-ui) :contents first :_meta :ui)]
              (is (=? {:prefersBorder true
                       :csp           {:baseUriDomains [origin]
                                       :connectDomains  [origin]
                                       :resourceDomains [origin]}}
                      ui-meta))
              (is (not (contains? ui-meta :domain))))))
        (testing "development metadata allows resources from the frontend dev server"
          (with-redefs [config/is-dev? true]
            (is (=? {:csp {:baseUriDomains [origin]
                           :resourceDomains [origin "http://localhost:8080"]}}
                    (-> (read-ui) :contents first :_meta :ui)))))
        (testing "non-ChatGPT User-Agent → :domain suppressed"
          (with-redefs [config/is-dev? false]
            (request/with-current-request {:headers {"user-agent" "claude-ai/0.1.0"}}
              (let [ui-meta (-> (read-ui) :contents first :_meta :ui)]
                (is (not (contains? ui-meta :domain)))))))
        (testing "ChatGPT User-Agent (`openai-mcp/...`) → :domain = origin"
          (with-redefs [config/is-dev? false]
            (request/with-current-request {:headers {"user-agent" "openai-mcp/1.0.0 (ChatGPT)"}}
              (is (=? {:status   :ok
                       :contents [{:uri      uri
                                   :mimeType "text/html;profile=mcp-app"
                                   :_meta    {:ui {:prefersBorder true
                                                   :domain        origin
                                                   :csp           {:baseUriDomains [origin]
                                                                   :connectDomains  [origin]
                                                                   :resourceDomains [origin]}}}}]}
                      (read-ui))))))))))

(deftest embed-mcp-template-base-url-test
  (testing "the MCP iframe document resolves relative bundle assets from the Metabase instance"
    (let [site-url "https://metabase.example.com/sub/path"
          html     (stencil/render-file
                    "frontend_client/mcp_apps_template.html"
                    {:instanceUrl    "\"https://metabase.example.com/sub/path\""
                     :instanceUrlRaw site-url
                     :sessionToken   nil
                     :mcpSessionId   nil})]
      (is (str/includes? html "<base href=\"https://metabase.example.com/sub/path/\"")))))
