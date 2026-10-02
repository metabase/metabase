(ns metabase.mcp.ui-credential-only-test
  "Nothing but the MCP Apps UI credential authenticates the `/api/embed-mcp` routes. A session, an API key or an OAuth
  bearer is refused there like an anonymous request, and the route does nothing."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.test-util :as mcp.tu]
   [metabase.mcp.ui-test-util :as ui.tu]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- mbql-query []
  (lib/limit (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues))) 1))

(defn- field-filter-query []
  (let [mp (mt/metadata-provider)]
    (lib/with-template-tags
      (lib/native-query mp "SELECT * FROM VENUES WHERE {{category}}")
      {"category" {:type         :dimension
                   :name         "category"
                   :display-name "Category"
                   :id           "category-tag-id"
                   :dimension    (lib/ref (lib.metadata/field mp (mt/id :venues :category_id)))
                   :widget-type  :number/=}})))

(defn- fixture!
  "An MCP session for `user-id`, with an MBQL handle and a native field-filter handle the user owns."
  [user-id]
  (let [session-id (mcp.session/create! user-id)]
    {:session-id session-id
     :mbql       (ui.tu/store-query-handle! session-id user-id (mbql-query))
     :native     (ui.tu/store-query-handle! session-id user-id (field-filter-query))}))

(defn- routes
  "`[label method url body]` for every iframe route, against the handles in `fixture`."
  [{:keys [mbql native]}]
  [["GET bootstrap"           :get  "embed-mcp/bootstrap" nil]
   ["POST feedback"           :post "embed-mcp/feedback" {:feedback          {:positive true}
                                                          :conversation_data {:source "mcp"}}]
   ["POST drills"             :post "embed-mcp/drills" {:handle    mbql
                                                        :operation {:type      "drill-thru" :drill "sort"
                                                                    :context   {:column "PRICE"}
                                                                    :direction "asc"}}]
   ["GET queries/:handle"     :get  (str "embed-mcp/queries/" mbql) nil]
   ["POST run"                :post (str "embed-mcp/queries/" mbql "/run") {}]
   ["POST pivot"              :post (str "embed-mcp/queries/" mbql "/pivot") {}]
   ["POST query_metadata"     :post (str "embed-mcp/queries/" mbql "/query_metadata") {}]
   ["POST parameter/remapping" :post (str "embed-mcp/queries/" native "/parameter/remapping")
    {:parameter {:id "category-tag-id"} :value 2}]
   ["POST derive"             :post (str "embed-mcp/queries/" mbql "/derive")
    {:operations [{:type "date-filter/clear"}]}]])

(defn- send!
  [expected-status method url headers body]
  (apply client/client-full-response
         (concat [method]
                 (when expected-status [expected-status])
                 [url {:request-options {:headers headers}}]
                 (when (some? body) [body]))))

(defn- side-effects
  "The counts that any served iframe route would change: stored handles, feedback rows, and query executions."
  []
  {:handles    (t2/count :model/McpQueryHandle)
   :feedback   (t2/count :model/McpFeedback)
   :executions (t2/count :model/QueryExecution)})

(defn- session-cookie [username]
  {"cookie" (str "metabase.SESSION=" (test.users/username->token username))})

(defn- bearer [token]
  {"authorization" (str "Bearer " token)})

(defn- create-api-key!
  "Create an API key in `group`. Returns `[key-id user-id unmasked-key]`."
  [group]
  (let [{:keys [id unmasked_key]} (mt/user-http-request :crowberto :post 200 "api-key"
                                                        {:group_id (:id group) :name (str (random-uuid))})]
    [id (t2/select-one-fn :user_id :model/ApiKey :id id) unmasked_key]))

(deftest only-the-ui-credential-reaches-the-iframe-routes-test
  (testing "Every credential except the UI credential gets 401 on every iframe route, even with a valid MCP session id
            and a handle its user owns, and the route has no effect"
    (mcp.tu/do-with-site-url!
     (fn []
       (mt/test-helpers-set-global-values!
         (mt/with-full-data-perms-for-all-users!
           (oauth-server.tu/with-oauth-client [client-id]
             (mt/with-model-cleanup [:model/OAuthAccessToken :model/McpQueryHandle :model/McpFeedback]
               (let [rasta    (mt/user->id :rasta)
                     api-keys (for [[label group] [["a regular group's API key" (perms-group/all-users)]
                                                   ["an admin API key" (perms-group/admin)]]]
                                [label (create-api-key! group)])]
                 (try
                   (doseq [[label user-id headers]
                           (concat
                            [["no credential"                rasta {}]
                             ["a cookie session"             rasta (session-cookie :rasta)]
                             ["an admin's cookie session"    (mt/user->id :crowberto) (session-cookie :crowberto)]
                             ["an X-Metabase-Session header" rasta
                              {"x-metabase-session" (test.users/username->token :rasta)}]
                             ["an MCP-bound OAuth bearer"    rasta
                              (bearer (oauth-server.tu/insert-access-token! rasta client-id mcp.tu/all-scopes
                                                                            :resource (oauth-server.tu/mcp-resource)))]
                             ["a REST OAuth bearer with mb:full" rasta
                              (bearer (oauth-server.tu/insert-access-token! rasta client-id
                                                                            [oauth-server/full-access-scope]))]]
                            (for [[label [_ user-id api-key]] api-keys]
                              [label user-id {"x-api-key" api-key}]))
                           :let  [fixture (fixture! user-id)
                                  headers (assoc headers "mcp-session-id" (:session-id fixture))
                                  before  (side-effects)]
                           [route method url body] (routes fixture)]
                     (testing (str label ", " route)
                       (is (= 401 (:status (send! 401 method url headers body))))
                       (is (= before (side-effects)) "the route did nothing")))
                   (finally
                     (doseq [[_ [key-id]] api-keys]
                       (mt/user-http-request :crowberto :delete 204 (str "api-key/" key-id))))))))))))))

(deftest ui-credential-with-another-users-cookie-runs-as-the-credential-user-test
  (testing "A UI credential for rasta sent with crowberto's session cookie runs as rasta, never as crowberto"
    (mt/with-full-data-perms-for-all-users!
      (mt/with-model-cleanup [:model/McpQueryHandle :model/McpFeedback]
        (let [{:keys [session-id user-id] :as auth} (ui.tu/ui-auth! :rasta mcp.tu/all-scopes)
              fixture (assoc (fixture! user-id) :session-id session-id)
              mbql    (ui.tu/store-query-handle! session-id user-id (mbql-query))
              headers (merge (ui.tu/headers auth) (session-cookie :crowberto))
              send    (fn [status method url body] (mcp.tu/do-with-site-url! #(send! status method url headers body)))]
          (testing "bootstrap describes rasta"
            (is (= user-id (get-in (send 200 :get "embed-mcp/bootstrap" nil) [:body :user :id]))))
          (testing "a drill stores a handle owned by rasta"
            (let [handle (get-in (send 200 :post "embed-mcp/drills"
                                       {:handle    mbql
                                        :operation {:type "drill-thru" :drill "sort"
                                                    :context {:column "PRICE"} :direction "asc"}})
                                 [:body :handle])]
              (is (some? (mcp.session/resolve-query-handle nil user-id handle)))
              (is (nil? (mcp.session/resolve-query-handle nil (mt/user->id :crowberto) handle)))))
          (testing "feedback is recorded for rasta"
            (send 204 :post "embed-mcp/feedback" {:feedback {:positive true} :conversation_data {:source "mcp"}})
            (is (= user-id (t2/select-one-fn :user_id :model/McpFeedback {:order-by [[:id :desc]]}))))
          (testing "a crowberto-owned handle does not resolve, so the request is not crowberto's"
            (let [crowberto (mt/user->id :crowberto)
                  theirs    (ui.tu/store-query-handle! (mcp.session/create! crowberto) crowberto (mbql-query))]
              (is (= 404 (:status (send 404 :post (str "embed-mcp/queries/" theirs "/run") {}))))))
          (testing "control: the UI credential is served on every route"
            (doseq [[route method url body] (routes fixture)]
              (testing route
                (is (<= 200 (:status (send nil method url body)) 204))))))))))
