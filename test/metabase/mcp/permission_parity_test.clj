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
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;;; --------------------------------------------------- Harness ----------------------------------------------------

(defn- tool-body
  "The tool result's payload: the structured channel when the tool declares one, else the text block."
  [result]
  (or (:structuredContent result)
      (when-let [text (some-> result :content first :text)]
        (try (json/decode+kw text) (catch Exception _ text)))))

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
  "Classifier for a batch read (`read_resource`, `get_content`): the call itself succeeds and reports
   the refusal per requested item, so a denial is an item that came back with an error."
  [result]
  (boolean (some :error (:resources (tool-body result)))))

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
