(ns metabase.agent-api.question-write-test
  "The v2 `question_write` tool: create and update a question or a model behind one `method`, from a handle, a
   portable query, or raw SQL.

   The teaching errors are asserted here as literally as the successes are. A `_write` tool's flat schema
   cannot say that a create needs a name and an update needs an id — only the error copy says it, and a model
   that gets a refusal it cannot act on retries the same call. So the copy is the contract, and a change to it
   is a change to the API."
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.handles :as handles]
   [metabase.agent-api.tools :as tools]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- write!
  ([body] (write! :crowberto 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/question-write" body)))

(defn- refusal
  "The message a refused call teaches with — a teaching error's body is the message itself."
  [response]
  (if (string? response) response (str (:message response))))

(defn- db-name []
  (t2/select-one-fn :name :model/Database (mt/id)))

(defn- orders-query
  "A portable MBQL 5 query against ORDERS — the dialect the tool takes: names, never ids."
  [& {:keys [aggregation limit]}]
  {:lib/type "mbql/query"
   :stages   [(cond-> {:lib/type     "mbql.stage/mbql"
                       :source-table [(db-name) "PUBLIC" "ORDERS"]}
                aggregation (assoc :aggregation (vec aggregation))
                limit       (assoc :limit limit))]})

(defn- card [id]
  (t2/select-one :model/Card :id id))

;;; ──────────────────────────────────────────────────────────────────
;;; create — the three ways a call names its query
;;; ──────────────────────────────────────────────────────────────────

(deftest creates-a-question-from-a-query-handle-test
  (testing "the handle a run minted saves the query that ran, so what is saved is what the caller saw"
    (mt/with-model-cleanup [:model/Card]
      (let [handle   (:query_handle (mt/user-http-request :crowberto :post 200 "agent/v2/execute-query"
                                                          {:query (orders-query :aggregation [["count" {}]])}))
            response (write! {:method "create" :name "Order count" :query_handle handle :display "scalar"})
            saved    (card (:id response))]
        (testing "the response is the card's concise projection — no follow-up read to say what was saved"
          (is (= {:id (:id saved) :name "Order count" :type "question" :display "scalar"
                  :description nil :database_id (mt/id) :table_id (mt/id :orders)
                  :source_card_id nil :collection_id (:collection_id saved) :archived false}
                 response)))
        (testing "and the stored query is the one the handle named"
          (is (= (get-in (handles/read-query (mt/user->id :crowberto) handle) [:stages 0 :source-table])
                 (get-in saved [:dataset_query :stages 0 :source-table])))
          (is (= 1 (count (get-in saved [:dataset_query :stages 0 :aggregation])))))))))

(deftest creates-a-question-from-a-portable-query-test
  (mt/with-model-cleanup [:model/Card]
    (let [response (write! {:method "create" :name "Orders" :query (orders-query :limit 5)})
          saved    (card (:id response))]
      (is (= "question" (:type response)))
      (testing "the portable names resolved into the query the card stores"
        (is (= (mt/id :orders) (get-in saved [:dataset_query :stages 0 :source-table])))
        (is (= 5 (get-in saved [:dataset_query :stages 0 :limit])))))))

(deftest creates-a-native-question-test
  (mt/with-model-cleanup [:model/Card]
    (let [response (write! {:method "create"
                            :name   "Big orders"
                            :native {:database_id (mt/id)
                                     :sql "SELECT ID, TOTAL FROM ORDERS WHERE TOTAL > {{floor}}"
                                     :template_tags {:floor {:type "number" :default 100
                                                             :display_name "Floor"}}}})
          saved    (card (:id response))
          tag      (get-in saved [:dataset_query :stages 0 :template-tags "floor"])]
      (testing "the SQL is saved as the card's query"
        (is (= "SELECT ID, TOTAL FROM ORDERS WHERE TOTAL > {{floor}}"
               (get-in saved [:dataset_query :stages 0 :native]))))
      (testing "and the variable it declares carries the type, default, and label the call gave it"
        (is (= {:type :number :default 100 :display-name "Floor"}
               (select-keys tag [:type :default :display-name])))))))

(deftest a-dimension-tag-filters-on-a-column-test
  (mt/with-model-cleanup [:model/Card]
    (let [response (write! {:method "create"
                            :name   "Orders by category"
                            :native {:database_id   (mt/id)
                                     :sql           "SELECT * FROM PRODUCTS WHERE {{category}}"
                                     :template_tags {:category {:type        "dimension"
                                                                :field_id    (mt/id :products :category)
                                                                :widget_type "string/="}}}})
          tag      (get-in (card (:id response)) [:dataset_query :stages 0 :template-tags "category"])]
      (is (= :dimension (:type tag)))
      (is (= :string/= (:widget-type tag)))
      (is (= (mt/id :products :category) (last (:dimension tag)))))))

(deftest a-variable-the-sql-does-not-declare-is-refused-test
  (testing "a value bound to a variable that is not in the SQL would silently do nothing, so the refusal names
            the variables the SQL does declare"
    (let [message (refusal (write! :crowberto 400
                                   {:method "create"
                                    :name   "Typo"
                                    :native {:database_id   (mt/id)
                                             :sql           "SELECT * FROM ORDERS WHERE TOTAL > {{floor}}"
                                             :template_tags {:flor {:type "number"}}}}))]
      (is (= "This SQL declares no `{{flor}}` variable. It declares: `floor`." message)))))

(deftest a-dimension-tag-needs-a-field-and-a-widget-test
  (testing "a dimension filter with no column"
    (is (re-find #"needs a `field_id`"
                 (refusal (write! :crowberto 400
                                  {:method "create" :name "Q"
                                   :native {:database_id   (mt/id)
                                            :sql           "SELECT * FROM ORDERS WHERE {{cat}}"
                                            :template_tags {:cat {:type "dimension" :widget_type "string/="}}}})))))
  (testing "a dimension filter with no widget"
    (is (re-find #"needs a `widget_type`"
                 (refusal (write! :crowberto 400
                                  {:method "create" :name "Q"
                                   :native {:database_id   (mt/id)
                                            :sql           "SELECT * FROM ORDERS WHERE {{cat}}"
                                            :template_tags {:cat {:type "dimension" :field_id 999999999}}}})))))
  (testing "a field of another database is not a column this SQL can filter on"
    (is (re-find #"is not a field of this database"
                 (refusal (write! :crowberto 400
                                  {:method "create" :name "Q"
                                   :native {:database_id   (mt/id)
                                            :sql           "SELECT * FROM ORDERS WHERE {{cat}}"
                                            :template_tags {:cat {:type        "dimension"
                                                                  :field_id    999999999
                                                                  :widget_type "string/="}}}}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The per-method contract the flat schema cannot state
;;; ──────────────────────────────────────────────────────────────────

(deftest create-without-a-name-names-the-missing-field-test
  (is (= "`method: \"create\"` needs `name`."
         (refusal (write! :crowberto 400 {:method "create" :query (orders-query)})))))

(deftest update-without-an-id-names-the-missing-field-test
  (is (= (str "`method: \"update\"` needs `id`. `id` names the one to change — `search` and `get_content` "
              "return it.")
         (refusal (write! :crowberto 400 {:method "update" :name "Renamed"})))))

(deftest create-with-an-id-is-not-an-upsert-test
  (testing "an id on a create would be a typo away from a silent duplicate, so it is refused rather than
            ignored"
    (is (= (str "`create` mints its own id, so it takes no `id`. To change what 42 already names, pass "
                "`method: \"update\"`.")
           (refusal (write! :crowberto 400 {:method "create" :id 42 :name "Q" :query (orders-query)}))))))

(deftest create-without-a-query-names-the-three-sources-test
  (is (= "Provide exactly one of `query`, `query_handle`, `native`."
         (refusal (write! :crowberto 400 {:method "create" :name "Q"})))))

(deftest two-query-sources-are-refused-test
  (testing "a call that names its query twice has not said which one to save"
    (is (= "Provide only one of `query`, `query_handle`, `native`, not several together."
           (refusal (write! :crowberto 400
                            {:method       "create"
                             :name         "Q"
                             :query        (orders-query)
                             :query_handle "1c9d2f3a-5b6e-4a7c-8d9e-0f1a2b3c4d5e"}))))))

(deftest an-update-names-its-query-once-or-not-at-all-test
  (testing "an update replaces the query only if it names one — and the rule against naming two is the same
            rule, and the same words, as on a create"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (is (= "Provide only one of `query`, `query_handle`, `native`, not several together."
             (refusal (write! :crowberto 400
                              {:method       "update"
                               :id           card-id
                               :query        (orders-query)
                               :query_handle "1c9d2f3a-5b6e-4a7c-8d9e-0f1a2b3c4d5e"})))))))

(deftest an-expired-handle-names-the-way-back-test
  (is (re-find #"No query handle"
               (refusal (write! :crowberto 404
                                {:method       "create"
                                 :name         "Q"
                                 :query_handle "1c9d2f3a-5b6e-4a7c-8d9e-0f1a2b3c4d5e"})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Models and their columns
;;; ──────────────────────────────────────────────────────────────────

(deftest a-model-carries-the-column-edits-it-was-saved-with-test
  (mt/with-model-cleanup [:model/Card]
    (let [response (write! {:method          "create"
                            :name            "Orders model"
                            :card_type       "model"
                            :query           (orders-query :limit 10)
                            :column_metadata [{:name          "TOTAL"
                                               :display_name  "Order total"
                                               :description   "What the customer paid"
                                               :semantic_type "type/Currency"}]})
          saved    (card (:id response))
          columns  (into {} (map (juxt :name identity)) (:result_metadata saved))]
      (is (= "model" (:type response)))
      (testing "the edited column carries the edit"
        (is (= {:display_name  "Order total"
                :description   "What the customer paid"
                :semantic_type :type/Currency}
               (select-keys (columns "TOTAL") [:display_name :description :semantic_type]))))
      (testing "and the columns the call did not name are still every column the query returns"
        (is (contains? columns "ID"))
        (is (< 1 (count columns)))))))

(deftest column-metadata-is-a-model-s-test
  (testing "a question has no curated columns — its columns are whatever its query returns"
    (is (= (str "`column_metadata` curates a model's columns, and this is a question. Pass "
                "`card_type: \"model\"`, or drop `column_metadata`.")
           (refusal (write! :crowberto 400
                            {:method          "create"
                             :name            "Q"
                             :query           (orders-query)
                             :column_metadata [{:name "TOTAL" :display_name "Total"}]}))))))

(deftest a-column-the-query-does-not-return-is-refused-test
  (is (re-find #"This query returns no column named \"NOPE\""
               (refusal (write! :crowberto 400
                                {:method          "create"
                                 :name            "M"
                                 :card_type       "model"
                                 :query           (orders-query)
                                 :column_metadata [{:name "NOPE" :display_name "Nope"}]})))))

;;; ──────────────────────────────────────────────────────────────────
;;; update — patch, move, pin, trash
;;; ──────────────────────────────────────────────────────────────────

(deftest an-update-changes-only-what-it-names-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Before" :description "Kept"}]
    (let [response (write! {:method "update" :id card-id :name "After"})]
      (is (= "After" (:name response)))
      (testing "a field the call did not name is left alone — a strict client sends `null` for every argument
                it did not set, so a null is not a value"
        (is (= "Kept" (:description response)))))))

(deftest a-question-moves-and-pins-through-its-own-write-test
  (mt/with-temp [:model/Collection {collection-id :id} {}
                 :model/Card       {card-id :id}       {}]
    (let [response (write! {:method "update" :id card-id
                            :collection_id collection-id :collection_position 1})]
      (is (= collection-id (:collection_id response)))
      (is (= 1 (:collection_position (card card-id)))))))

(deftest the-top-level-collection-is-named-root-test
  (mt/with-temp [:model/Collection {collection-id :id} {}
                 :model/Card       {card-id :id}       {:collection_id collection-id}]
    (let [response (write! {:method "update" :id card-id :collection_id "root"})]
      (is (nil? (:collection_id response))))))

(deftest the-trash-is-not-a-destination-test
  (testing "\"trash\" is a locator a read takes, never a place a write puts something: the trash is a state,
            and `archived: true` is how a card enters it"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (is (some? (write! :crowberto 400 {:method "update" :id card-id :collection_id "trash"})))
      (is (= (str "The trash is not a place to save to. Pass `archived: true` to trash something, "
                  "`archived: false` to restore it.")
             (try
               (tools/resolve-collection-id "trash")
               (catch clojure.lang.ExceptionInfo e (ex-message e))))))))

(deftest archiving-trashes-and-restores-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (testing "`archived: true` is the delete"
      (is (true? (:archived (write! {:method "update" :id card-id :archived true}))))
      (is (true? (:archived (card card-id)))))
    (testing "and it is reversible"
      (is (false? (:archived (write! {:method "update" :id card-id :archived false}))))
      (is (false? (:archived (card card-id)))))))

(deftest a-question-can-be-saved-inside-a-dashboard-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
      (let [response (write! {:method "create" :name "Dashboard question"
                              :query (orders-query) :dashboard_id dashboard-id})]
        (is (= dashboard-id (:dashboard_id (card (:id response)))))))))

(deftest a-dashboard-question-lives-in-the-dashboard-s-collection-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
    (is (= (str "A question saved inside a dashboard lives in that dashboard's collection, so it takes "
                "`dashboard_id` or `collection_id`, not both. Drop one.")
           (refusal (write! :crowberto 400
                            {:method "create" :name "Q" :query (orders-query)
                             :dashboard_id dashboard-id :collection_id 1}))))))

(deftest a-question-updates-its-query-test
  (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}]
    (write! {:method "update" :id card-id :query (orders-query :aggregation [["count" {}]])})
    (is (= [[:count {}]]
           (mapv (fn [[op opts]] [op (dissoc opts :lib/uuid)])
                 (get-in (card card-id) [:dataset_query :stages 0 :aggregation]))))))

(deftest a-metric-is-not-a-question-test
  (testing "the two tools are two contracts, and pushing a metric through the question path would skip the
            shape rules that make it a metric"
    (mt/with-temp [:model/Card {metric-id :id} {:type :metric}]
      (is (= (str "Card " metric-id " is a metric, and this tool writes model or question. Change it with "
                  "`metric_write`.")
             (refusal (write! :crowberto 400 {:method "update" :id metric-id :name "Renamed"})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The permissions the app enforces, enforced here
;;; ──────────────────────────────────────────────────────────────────

(deftest a-create-defaults-to-the-caller-s-personal-collection-test
  (testing "content an agent made lands in the user's own space, not in shared \"Our analytics\", which is the
            one collection everybody sees and nobody owns"
    (mt/with-model-cleanup [:model/Card]
      (let [response (write! :rasta 200 {:method "create" :name "Mine" :query (orders-query)})]
        (is (= (t2/select-one-fn :id :model/Collection
                                 :personal_owner_id (mt/user->id :rasta))
               (:collection_id response)))))))

(deftest a-collection-the-caller-cannot-write-to-is-refused-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {collection-id :id} {}]
      (testing "the create check is the app's own — a tool cannot save where the user could not"
        (write! :rasta 403 {:method "create" :name "Q" :query (orders-query)
                            :collection_id collection-id})))))

(deftest a-query-the-caller-cannot-run-cannot-be-saved-test
  (testing "saving a query is running it later, so it needs the permission running it needs"
    (mt/with-no-data-perms-for-all-users!
      (write! :rasta 403 {:method "create" :name "Q" :query (orders-query)}))))

(deftest saving-sql-needs-native-query-permission-test
  (testing "the refusal names the permission that is missing, and the tool that saves without it"
    (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
      (let [message (refusal (write! :rasta 403
                                     {:method "create" :name "Q"
                                      :native {:database_id (mt/id) :sql "SELECT 1"}}))]
        (is (re-find #"Native query editing" message))
        (is (re-find #"`execute_query`" message))))))
