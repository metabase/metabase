(ns metabase.mcp.ui-credential-authz-test
  "The MCP Apps iframe runs only queries an MCP tool or the derive route stored under a handle. Every handle route
  has two gates: the credential must carry the scope the route costs, and the credential's user must be allowed to
  run the stored query."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.ui-test-util :as ui.tu]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- venues-query []
  (-> (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))
      (lib/limit 1)))

(defn- native-query []
  (lib/native-query (mt/metadata-provider) "SELECT 1 AS one"))

(defn- card-query [card-id]
  (-> (lib/query (mt/metadata-provider) (lib.metadata/card (mt/metadata-provider) card-id))
      (lib/limit 1)))

(defn- handle-post!
  "POST to the iframe route `route` of a handle storing `query`, owned by rasta, with a credential holding `scopes`.
  Returns the full response."
  [scopes route query & [body]]
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :rasta scopes)
          handle (ui.tu/store-query-handle! session-id user-id query)]
      (ui.tu/ui-request! auth :post nil (str "embed-mcp/queries/" handle "/" route) (or body {})))))

(defn- rows [response]
  (get-in response [:body :data :rows]))

(defn- refused?
  "Whether `response` is the refusal a query run gives a query its user lacks permission for: 403, a failed status,
  `missing-required-permissions`, and no rows."
  [response]
  (and (= 403 (:status response))
       (= "failed" (get-in response [:body :status]))
       (= "missing-required-permissions" (get-in response [:body :error_type]))
       (empty? (rows response))))

(deftest run-requires-the-query-scope-test
  (testing "Gate 1: a credential whose minting session lacked agent:query:run cannot run a handle, even one its user
            may query"
    (mt/with-full-data-perms-for-all-users!
      (doseq [route ["run" "pivot" "query_metadata"]]
        (testing route
          (is (= 403 (:status (handle-post! #{"agent:search"} route (venues-query))))))))))

(deftest run-runs-only-what-the-user-may-query-test
  (testing "Gate 2: the credential's scope lets the iframe run a handle, and the user's own data permissions decide
            what runs. Rasta, with no data permissions, is refused."
    (mt/with-no-data-perms-for-all-users!
      (is (refused? (handle-post! ui.tu/query-scopes "run" (venues-query))))))
  (testing "control: the same request runs when rasta may query the table"
    (mt/with-full-data-perms-for-all-users!
      (let [response (handle-post! ui.tu/query-scopes "run" (venues-query))]
        (is (= 202 (:status response)))
        (is (= 1 (count (rows response))))))))

(deftest native-sql-needs-the-sql-scope-and-the-native-permission-test
  (let [both-scopes #{"agent:query:run" "agent:sql:run"}]
    (testing "Gate 1: a native handle needs agent:sql:run on top of agent:query:run"
      (mt/with-full-data-perms-for-all-users!
        (let [response (handle-post! ui.tu/query-scopes "run" (native-query))]
          (is (= 403 (:status response)))
          (is (empty? (rows response))))))
    (testing "Gate 2: with both scopes, the user's own native-query permission decides whether it runs. Rasta may
              build queries on the database but not write SQL."
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
        (is (refused? (handle-post! both-scopes "run" (native-query))))
        (testing "while an MBQL handle on the same database runs, so it is the native permission that refuses"
          (is (= 202 (:status (handle-post! both-scopes "run" (venues-query))))))))
    (testing "control: the same native handle runs when rasta may write SQL"
      (mt/with-full-data-perms-for-all-users!
        (let [response (handle-post! both-scopes "run" (native-query))]
          (is (= 202 (:status response)))
          (is (= [[1]] (rows response))))))))

(deftest kill-switches-test
  (mt/with-full-data-perms-for-all-users!
    (testing "with mcp-execute-sql-enabled off, a native handle is refused even to a credential with agent:sql:run"
      (mt/with-temporary-setting-values [mcp-execute-sql-enabled false]
        (let [response (handle-post! #{"agent:query:run" "agent:sql:run"} "run" (native-query))]
          (is (= 403 (:status response)))
          (is (re-find #"mcp-execute-sql-enabled" (str (:body response)))))
        (testing "while an MBQL handle still runs"
          (is (= 202 (:status (handle-post! ui.tu/query-scopes "run" (venues-query))))))))
    (testing "with the MCP server disabled, every iframe route is refused"
      (mt/with-temporary-setting-values [mcp-enabled? false]
        (is (= 403 (:status (handle-post! ui.tu/query-scopes "run" (venues-query)))))
        (is (= 403 (:status (ui.tu/ui-request! (ui.tu/ui-auth! :rasta) :get 403 "embed-mcp/bootstrap"))))))))

(deftest card-source-runs-only-when-the-user-may-read-the-card-test
  (testing "A handle whose source is a saved question runs only if its user may read the collection the question
            lives in"
    (mt/with-full-data-perms-for-all-users!
      (mt/with-temp [:model/Collection {hidden-id :id}   {:name "hidden"}
                     :model/Collection {visible-id :id}  {:name "visible"}
                     :model/Card       {hidden-card :id}  {:collection_id hidden-id
                                                           :dataset_query (venues-query)}
                     :model/Card       {visible-card :id} {:collection_id visible-id
                                                           :dataset_query (venues-query)}]
        (mt/with-non-admin-groups-no-collection-perms hidden-id
          (testing "a card in a collection rasta cannot read is refused"
            (let [response (handle-post! ui.tu/query-scopes "run" (card-query hidden-card))]
              (is (= 403 (:status response)))
              (is (empty? (rows response)))))
          (testing "control: a card in a collection rasta can read runs"
            (let [response (handle-post! ui.tu/query-scopes "run" (card-query visible-card))]
              (is (= 202 (:status response)))
              (is (= 1 (count (rows response)))))))))))

(deftest metadata-and-pivot-show-only-what-the-user-may-see-test
  (testing "query_metadata and pivot run as the credential's user: a table rasta cannot see contributes no metadata
            and no rows"
    (mt/with-no-data-perms-for-all-users!
      (let [metadata (handle-post! ui.tu/query-scopes "query_metadata" (venues-query))]
        (is (= 200 (:status metadata)))
        (is (empty? (get-in metadata [:body :tables])))
        (is (empty? (get-in metadata [:body :databases]))))
      (let [pivot (handle-post! ui.tu/query-scopes "pivot" (venues-query))]
        (is (= 403 (:status pivot)))
        (is (empty? (rows pivot))))))
  (testing "control: with permission, query_metadata describes the table and pivot runs"
    (mt/with-full-data-perms-for-all-users!
      (let [metadata (handle-post! ui.tu/query-scopes "query_metadata" (venues-query))]
        (is (= 200 (:status metadata)))
        (is (some #(= (mt/id :venues) (:id %)) (get-in metadata [:body :tables]))))
      (is (= 202 (:status (handle-post! ui.tu/query-scopes "pivot" (venues-query))))))))

(deftest handle-routes-are-user-scoped-test
  (testing "A handle another user stored does not resolve for this credential's user, on any route"
    (mt/with-full-data-perms-for-all-users!
      (mt/with-model-cleanup [:model/McpQueryHandle]
        (let [owner-id     (mt/user->id :crowberto)
              owner-handle (ui.tu/store-query-handle! (mcp.session/create! owner-id) owner-id (venues-query))
              auth         (ui.tu/ui-auth! :rasta)]
          (doseq [route ["run" "pivot" "query_metadata" "parameter/remapping"]]
            (testing route
              (is (= 404 (:status (ui.tu/ui-request! auth :post nil
                                                     (str "embed-mcp/queries/" owner-handle "/" route)
                                                     {:parameter {:id "x"} :value 1})))))))))))

(deftest run-ignores-a-query-in-the-body-test
  (testing "The iframe cannot run a query that no handle holds: a run reads only the stored query, whatever the body
            carries"
    (mt/with-full-data-perms-for-all-users!
      (let [smuggled {:database (mt/id)
                      :type     :native
                      :native   {:query "SELECT 2 AS two"}}
            response (handle-post! ui.tu/query-scopes "run" (native-query) smuggled)]
        (is (= 403 (:status response))
            "the stored native handle is gated on agent:sql:run, and the body changes nothing"))
      (let [response (handle-post! ui.tu/query-scopes "run" (venues-query)
                                   {:database (mt/id)
                                    :type     :native
                                    :native   {:query "SELECT 2 AS two"}})]
        (is (= 202 (:status response)))
        (is (= 1 (count (rows response))))
        (is (= 6 (count (first (rows response))))
            "the venues row, not the smuggled one-column SELECT")))))

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

(deftest parameter-remapping-reads-the-handle-test
  (let [both-scopes #{"agent:query:run" "agent:sql:run"}
        remap!      (fn [scopes parameter-id]
                      (handle-post! scopes "parameter/remapping" (field-filter-query)
                                    {:parameter {:id parameter-id} :value 2}))]
    (mt/with-full-data-perms-for-all-users!
      (testing "a field-filter parameter of the stored query is remapped"
        (is (=? {:status 200 :body [2 "American"]}
                (remap! both-scopes "category-tag-id"))))
      (testing "a parameter id the stored query does not have is a 404: the field comes from the handle, not the
                request"
        (is (= 404 (:status (remap! both-scopes "not-a-tag")))))
      (testing "Gate 1: the handle is native, so remapping also needs agent:sql:run"
        (is (= 403 (:status (remap! ui.tu/query-scopes "category-tag-id"))))))))
