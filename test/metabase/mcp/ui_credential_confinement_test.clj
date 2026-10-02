(ns metabase.mcp.ui-credential-confinement-test
  "The MCP Apps UI credential authenticates only the `/api/embed-mcp` handlers, which check it themselves. Everywhere
  else it is no credential at all: a request carrying it is anonymous."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-routes.routes :as api-routes]
   [metabase.api.open-api :as open-api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.http-handler :as mcp.http-handler]
   [metabase.mcp.ui-test-util :as ui.tu]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private every-scope
  "Every scope the iframe's routes cost, so nothing here is refused for lack of scope."
  #{"agent:query:run" "agent:sql:run"})

(defn- venues-query []
  (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))

(deftest dataset-routes-refuse-the-credential-test
  (testing "The dataset routes the iframe used to POST queries to treat the credential as no credential at all"
    (mt/with-full-data-perms-for-all-users!
      (let [auth   (ui.tu/ui-auth! :crowberto every-scope)
            legacy {:database (mt/id) :type :query :query {:source-table (mt/id :venues) :limit 1}}]
        (doseq [[url body] [["dataset" legacy]
                            ["dataset/pivot" legacy]
                            ["dataset/query_metadata" legacy]
                            ["dataset/parameter/remapping" {:parameter {:id "x" :type "category"} :value 1}]]]
          (testing url
            (is (= 401 (:status (ui.tu/ui-request auth :post 401 url body))))))
        (testing "control: the same credential runs a handle holding the same query"
          (let [handle (ui.tu/store-query-handle! (:session-id auth) (:user-id auth) (lib/limit (venues-query) 1))]
            (is (= 202 (:status (ui.tu/ui-request auth :post nil (str "embed-mcp/queries/" handle "/run") {}))))))))))

(deftest ui-credential-cannot-read-the-profile-test
  (testing "GHY-4400: `refresh_ui_credential` is not a scope-escalation primitive — the credential cannot read
            the general REST API"
    (let [auth (ui.tu/ui-auth! :crowberto every-scope)]
      (doseq [[method url] [[:get "user/current"]
                            [:get "collection"]
                            [:get "database"]
                            [:get "card"]
                            [:put (str "user/" (mt/user->id :crowberto))]]]
        (testing (str method " " url)
          (is (= 401 (:status (ui.tu/ui-request auth method 401 url))))))
      (testing "`/api/session/properties` serves anonymous callers, so the credential degrades to the public payload"
        (let [with-credential (:body (ui.tu/ui-request auth :get 200 "session/properties"))
              anonymous       (:body (client/client-full-response :get 200 "session/properties"))
              authenticated   (mt/user-http-request :rasta :get 200 "session/properties")]
          (is (= (set (keys anonymous)) (set (keys with-credential)))
              "the credential buys nothing here")
          (is (seq (remove (set (keys anonymous)) (keys authenticated)))
              "and a logged-in user really does see more, so the assertion above is not vacuous")))
      (is (= 200 (:status (ui.tu/ui-request auth :get 200 "embed-mcp/bootstrap")))
          "the purpose-built endpoint serves what the iframe actually needs"))))

(defn- authenticated-as
  "The user id the production session middleware authenticates `method` + `uri` as, given the iframe's headers for
  `auth`, or nil when it leaves the request anonymous."
  [auth method uri]
  (let [seen (promise)]
    ((mw.session/wrap-current-user-info (fn [request _respond _raise] (deliver seen request))
                                        mcp.http-handler/options)
     {:request-method method
      :uri            uri
      :headers        (ui.tu/headers auth)}
     identity
     identity)
    (:metabase-user-id (deref seen 10000 nil))))

(deftest session-middleware-never-resolves-the-credential-test
  (testing "No route in the /api tree is authenticated by the credential at the session middleware: every
            `defendpoint` sees the request as anonymous. Only the /api/embed-mcp handlers, which are not
            `defendpoint`s, read the credential."
    (let [auth  (ui.tu/ui-auth! :crowberto every-scope)
          paths (:paths (open-api/open-api-spec (var-get #'api-routes/routes) "/api"))]
      (is (< 500 (count paths)) "the walk reaches the whole /api tree")
      (doseq [[path methods] paths
              method         (keys methods)
              :let           [uri (str/replace path #"\{[^}]+\}" "1")]]
        (is (nil? (authenticated-as auth method uri))
            (str method " " uri)))
      (testing "including the iframe's own routes: the handlers authenticate, not the middleware"
        (is (nil? (authenticated-as auth :get "/api/embed-mcp/bootstrap")))))))
