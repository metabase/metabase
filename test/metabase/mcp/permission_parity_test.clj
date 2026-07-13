(ns metabase.mcp.permission-parity-test
  "The permission-parity matrix: the release-gating proof that a tool can never do what the caller
   couldn't do in the app.

   Construction already prevents the holes — every tool call is a synthetic in-process request under
   the caller's real user, so the endpoint checks, the model-level `can-read?`/`can-write?` checks,
   and the QP's permission middleware all fire exactly as they do for a browser request. This matrix
   is the backstop that proves it and catches regressions: for one user in one permission scenario,
   it calls the tool and the public REST endpoint the tool stands in for, and asserts the two give
   the same answer.

   The rows below cover the reference tools; every tool task adds its own rows with
   [[check-parity!]]. The sandboxed-user scenario needs EE code and lives in
   `metabase-enterprise.mcp.permission-parity-test`, which reuses this harness.

   Scopes are deliberately left unrestricted here. Scope grants and admin toolset policy narrow
   *below* the permission floor; this matrix asserts the floor itself, so it must not be able to pass
   because a scope check happened to deny the call first."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;;; --------------------------------------------------- Harness ----------------------------------------------------

(defn- tool-body
  "The tool result's payload. The text block carries it on every tool: a v2 result puts the body there
   exactly once and reserves `structuredContent` for next-step fields, so reading the structured channel
   first would see counts where the rows are."
  [result]
  (or (when-let [text (some-> result :content first :text)]
        (try (json/decode+kw text) (catch Exception _ text)))
      (:structuredContent result)))

(defn- query-failed?
  "Whether `body` is a query result the query processor refused to run. The QP reports a permission
   failure on the streaming path as a failed result body rather than an HTTP error, and it does so
   identically for the tool and for REST — so both classifiers have to recognize it."
  [body]
  (and (map? body)
       (contains? #{"failed" :failed} (:status body))))

(defn tool-denied?
  "Default classifier for a tool result. A tool refuses in-band, as an error result or a failed query."
  [result]
  (boolean (or (:isError result)
               (query-failed? (tool-body result)))))

(defn any-item-denied?
  "Classifier for a batch read (`read_resource`, `get_content`): the call itself succeeds and reports the
   refusal per requested item, so a denial is an item that came back with an error. The two tools name
   their item list differently — v1's `resources`, v2's envelope `data` — and either is read here."
  [result]
  (let [body (tool-body result)]
    (boolean (some :error (concat (:resources body) (:data body))))))

(defn- rest-denied?
  [{:keys [status body]}]
  (boolean (or (<= 400 status 499)
               (query-failed? body))))

(defn- outcome [denied?] (if denied? :denied :allowed))

(defn check-parity!
  "Assert the MCP tool and the public REST endpoint it stands in for give `user` the same answer, and
   that the answer is `expect` (`:allowed` or `:denied`).

   `tool` is `[tool-name arguments]`. `rest` is the argument vector for
   `mt/user-http-request-full-response` after the user, e.g. `[:post \"dataset\" query]`.
   `tool-denied?` classifies the tool result and defaults to [[tool-denied?]]; batch reads pass
   [[any-item-denied?]], which reads the per-item refusal out of an otherwise-successful call."
  [{:keys [scenario user tool expect] rest-request :rest :as parity-case}]
  (let [[tool-name arguments] tool
        denied?               (get parity-case :tool-denied? tool-denied?)
        tool-result           (mt/with-test-user user
                                (mcp.tools/call-tool nil tool-name arguments))
        rest-response         (apply mt/user-http-request-full-response user rest-request)
        tool-outcome          (outcome (denied? tool-result))
        rest-outcome          (outcome (rest-denied? rest-response))]
    (testing (str tool-name " × " (name scenario))
      (is (= expect tool-outcome rest-outcome)
          (str "Tool and REST must agree, and both must " (name expect) ".\n"
               "  tool: " (pr-str (or (some-> tool-result :content first :text) tool-result)) "\n"
               "  REST: " (:status rest-response) " " (pr-str (:body rest-response)))))))

;;; ------------------------------------------------ Harness self-test ---------------------------------------------
;;
;; A matrix that cannot fail proves nothing, so this row asserts the matrix catches the failure it
;; exists to catch: a tool that hands back what the REST endpoint refuses the same user.

(defn- report-types
  "Run `thunk` with test reporting captured, returning the report types it emitted instead of failing
   this test with them."
  [thunk]
  (let [types (atom [])]
    (binding [clojure.test/report (fn [m] (swap! types conj (:type m)))]
      (thunk))
    @types))

(deftest matrix-catches-a-missing-check-test
  (testing "a tool that returns content REST denies the same user fails the matrix"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (let [leaked (str "{\"resources\":[{\"uri\":\"metabase://question/" (:id card) "\",\"content\":{}}]}")]
          (is (= [:fail]
                 (report-types
                  #(mt/with-dynamic-fn-redefs [mcp.tools/call-tool
                                               (fn [& _] {:content [{:type "text" :text leaked}]})]
                     (check-parity!
                      {:scenario     :no-collection-access
                       :user         :rasta
                       :expect       :denied
                       :tool         ["read_resource" {:uris [(str "metabase://question/" (:id card))]}]
                       :tool-denied? any-item-denied?
                       :rest         [:get (str "card/" (:id card))]}))))))))))

;;; ---------------------------------------------------- Rows ------------------------------------------------------

(deftest execute-sql-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces run the query"
    (check-parity!
     {:scenario :full-permissions
      :user     :rasta
      :expect   :allowed
      :tool     ["execute_sql" {:database_id (mt/id) :sql "SELECT 1"}]
      :rest     [:post "dataset" {:database (mt/id)
                                  :type     :native
                                  :native   {:query "SELECT 1"}}]})))

(deftest execute-sql-blocked-database-parity-test
  (perms.test-util/with-no-data-perms-for-all-users!
    (check-parity!
     {:scenario :blocked-database
      :user     :rasta
      :expect   :denied
      :tool     ["execute_sql" {:database_id (mt/id) :sql "SELECT 1"}]
      :rest     [:post "dataset" {:database (mt/id)
                                  :type     :native
                                  :native   {:query "SELECT 1"}}]})))

(deftest execute-sql-no-native-permission-parity-test
  (testing "a query-builder-only user is refused the native query by both surfaces"
    (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
      (check-parity!
       {:scenario :no-native-query-permission
        :user     :rasta
        :expect   :denied
        :tool     ["execute_sql" {:database_id (mt/id) :sql "SELECT 1"}]
        :rest     [:post "dataset" {:database (mt/id)
                                    :type     :native
                                    :native   {:query "SELECT 1"}}]}))))

(deftest read-resource-no-collection-access-parity-test
  (testing "a card the user cannot read is refused by both surfaces"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario     :no-collection-access
          :user         :rasta
          :expect       :denied
          :tool         ["read_resource" {:uris [(str "metabase://question/" (:id card))]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "card/" (:id card))]})))))

(deftest create-collection-read-only-collection-parity-test
  (testing "a collection the user can read but not curate is refused as a write target by both surfaces"
    (mt/with-temp [:model/Collection coll {}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
        (check-parity!
         {:scenario :read-only-collection
          :user     :rasta
          :expect   :denied
          :tool     ["create_collection" {:name "Parity" :parent_collection_id (:id coll)}]
          :rest     [:post "collection" {:name "Parity" :parent_id (:id coll)}]})))))

(deftest execute-question-archived-target-parity-test
  (testing "archiving is not a permission: a readable archived question still runs, on both surfaces"
    (mt/with-temp [:model/Card card {:archived      true
                                     :dataset_query (mt/mbql-query venues {:limit 1})}]
      (check-parity!
       {:scenario :archived-target
        :user     :rasta
        :expect   :allowed
        :tool     ["execute_question" {:id (:id card)}]
        :rest     [:post (str "card/" (:id card) "/query")]}))))

;;; ----------------------------------------------- browse_data ----------------------------------------------------

(deftest browse-data-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces list the database's schemas"
    (check-parity!
     {:scenario :full-permissions
      :user     :rasta
      :expect   :allowed
      :tool     ["browse_data" {:action "list_schemas" :database_id (mt/id)}]
      :rest     [:get (str "database/" (mt/id) "/schemas")]})))

(deftest browse-data-blocked-database-parity-test
  (perms.test-util/with-no-data-perms-for-all-users!
    (check-parity!
     {:scenario :blocked-database
      :user     :rasta
      :expect   :denied
      :tool     ["browse_data" {:action "list_schemas" :database_id (mt/id)}]
      :rest     [:get (str "database/" (mt/id) "/schemas")]})))

(defn- get-fields-denied?
  "Classifier for a single-table `get_fields`: the batch metadata read reports a refusal by returning
   the table in `omitted` rather than erroring the call, so a denial is an empty `data`."
  [result]
  (empty? (:data (tool-body result))))

(deftest browse-data-get-fields-blocked-database-parity-test
  (perms.test-util/with-no-data-perms-for-all-users!
    (check-parity!
     {:scenario     :blocked-database
      :user         :rasta
      :expect       :denied
      :tool         ["browse_data" {:action "get_fields" :table_ids [(mt/id :venues)]}]
      :tool-denied? get-fields-denied?
      :rest         [:get (str "table/" (mt/id :venues) "/query_metadata")]})))

;;; ------------------------------------- browse_collection · get_parameter_values ---------------------------------

(deftest browse-collection-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces list the collection's items"
    (mt/with-temp [:model/Collection coll {}]
      (check-parity!
       {:scenario :full-permissions
        :user     :rasta
        :expect   :allowed
        :tool     ["browse_collection" {:id (:id coll)}]
        :rest     [:get (str "collection/" (:id coll) "/items")]}))))

(deftest browse-collection-no-collection-access-parity-test
  (mt/with-temp [:model/Collection coll {}]
    (mt/with-non-admin-groups-no-collection-perms coll
      (check-parity!
       {:scenario :no-collection-access
        :user     :rasta
        :expect   :denied
        :tool     ["browse_collection" {:id (:id coll)}]
        :rest     [:get (str "collection/" (:id coll) "/items")]}))))

(deftest browse-collection-archived-target-parity-test
  (testing "archiving is not a permission: a readable archived collection is still browsable, on both surfaces"
    (mt/with-temp [:model/Collection coll {:archived true}]
      (check-parity!
       {:scenario :archived-target
        :user     :rasta
        :expect   :allowed
        :tool     ["browse_collection" {:id (:id coll)}]
        :rest     [:get (str "collection/" (:id coll) "/items")]}))))

;;; ------------------------------------------------- get_content --------------------------------------------------

(deftest get-content-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces return the card"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
      (check-parity!
       {:scenario     :full-permissions
        :user         :rasta
        :expect       :allowed
        :tool         ["get_content" {:items [{:type "question" :id (:id card)}]}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "card/" (:id card))]}))))

(deftest get-content-no-collection-access-parity-test
  (testing "a card the caller cannot read is refused by both surfaces"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario     :no-collection-access
          :user         :rasta
          :expect       :denied
          :tool         ["get_content" {:items [{:type "question" :id (:id card)}]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "card/" (:id card))]})))))

(deftest get-content-dashboard-no-collection-access-parity-test
  (testing "and a dashboard the caller cannot read, likewise — every type reads through the app's own check"
    (mt/with-temp [:model/Collection coll {}
                   :model/Dashboard  dash {:collection_id (:id coll)}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario     :no-collection-access
          :user         :rasta
          :expect       :denied
          :tool         ["get_content" {:items [{:type "dashboard" :id (:id dash)}]}]
          :tool-denied? any-item-denied?
          :rest         [:get (str "dashboard/" (:id dash))]})))))

(deftest get-content-archived-target-parity-test
  (testing "archiving is not a permission: a readable archived card still reads, on both surfaces"
    (mt/with-temp [:model/Card card {:archived true :dataset_query (mt/mbql-query venues)}]
      (check-parity!
       {:scenario     :archived-target
        :user         :rasta
        :expect       :allowed
        :tool         ["get_content" {:items [{:type "question" :id (:id card)}]}]
        :tool-denied? any-item-denied?
        :rest         [:get (str "card/" (:id card))]}))))

(deftest get-parameter-values-no-collection-access-parity-test
  (testing "a dashboard the caller cannot read gives up no filter values, on either surface"
    (mt/with-temp [:model/Collection coll {}
                   :model/Card       card {:dataset_query (mt/mbql-query venues)}
                   :model/Dashboard  dash {:collection_id (:id coll)
                                           :parameters    [{:name "Category" :slug "category"
                                                            :id   "cat" :type "string/="}]}
                   :model/DashboardCard _ {:dashboard_id       (:id dash)
                                           :card_id            (:id card)
                                           :parameter_mappings [{:parameter_id "cat"
                                                                 :card_id      (:id card)
                                                                 :target       [:dimension (mt/$ids venues $category_id->categories.name)]}]}]
      (mt/with-non-admin-groups-no-collection-perms coll
        (check-parity!
         {:scenario :no-collection-access
          :user     :rasta
          :expect   :denied
          :tool     ["get_parameter_values" {:target "dashboard" :id (:id dash) :parameter_id "cat"}]
          :rest     [:get (str "dashboard/" (:id dash) "/params/cat/values")]})))))

;;; ------------------------------------------------- search -------------------------------------------------------
;;
;; `search` never refuses a call, so there is no denial to hold against REST's — it answers with what
;; the caller can read. Its parity claim is therefore about the *result set*: the hits the tool returns
;; are the hits the app's own search returns for that user, and content they cannot read is in neither.

(defn- search-tool-names
  [user term]
  (mt/with-test-user user
    (->> (mcp.tools/call-tool nil "search" {:term_queries [term] :type ["question"]})
         tool-body
         :data
         (map :name)
         set)))

(defn- rest-search-names
  [user term]
  (->> (mt/user-http-request user :get 200 "search" :q term :models "card")
       :data
       (map :name)
       set))

(deftest search-returns-what-the-app-returns-parity-test
  (binding [search.ingestion/*force-sync* true]
    (search.tu/with-new-search-if-available-otherwise-legacy
      (mt/with-temp [:model/Collection coll {}
                     :model/Card       _    {:name "ParityHidden Question" :collection_id (:id coll)}]
        (mt/with-non-admin-groups-no-collection-perms coll
          (testing "a question in a collection the caller cannot read is in neither surface's results"
            (is (= #{} (search-tool-names :rasta "ParityHidden")))
            (is (= (rest-search-names :rasta "ParityHidden")
                   (search-tool-names :rasta "ParityHidden"))))
          (testing "and an admin, who can read it, gets it from both"
            (is (= #{"ParityHidden Question"} (search-tool-names :crowberto "ParityHidden")))
            (is (= (rest-search-names :crowberto "ParityHidden")
                   (search-tool-names :crowberto "ParityHidden")))))))))

;;; ------------------------------------------------ execute_query -------------------------------------------------

(defn- portable-venues-query
  "The VENUES table in the external dialect `execute_query` takes: names, never ids."
  []
  {:lib/type "mbql/query"
   :stages   [{:lib/type     "mbql.stage/mbql"
               :source-table [(t2/select-one-fn :name :model/Database (mt/id)) "PUBLIC" "VENUES"]
               :limit        1}]})

(deftest execute-query-baseline-parity-test
  (testing "the positive control: with full permissions both surfaces run the query"
    (check-parity!
     {:scenario :full-permissions
      :user     :rasta
      :expect   :allowed
      :tool     ["execute_query" {:query (portable-venues-query)}]
      :rest     [:post "dataset" (mt/mbql-query venues {:limit 1})]})))

(deftest execute-query-blocked-database-parity-test
  (perms.test-util/with-no-data-perms-for-all-users!
    (check-parity!
     {:scenario :blocked-database
      :user     :rasta
      :expect   :denied
      :tool     ["execute_query" {:query (portable-venues-query)}]
      :rest     [:post "dataset" (mt/mbql-query venues {:limit 1})]})))
