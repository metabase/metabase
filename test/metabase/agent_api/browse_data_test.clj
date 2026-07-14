(ns metabase.agent-api.browse-data-test
  "The v2 `browse_data` tool. A named action enum over the data hierarchy, the backing endpoints' own
   permission filters, and two bounding rules: `list_*` pages with steering truncation, `get_fields`
   emits complete tables until the budget runs out and names the rest."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.agent-api.browse-data :as browse-data]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- browse!
  ([body] (browse! :rasta 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/browse-data" body)))

(defn- refusal!
  "The message of a refused call. A teaching error surfaces as the message itself, so the model reads
   the fix out of the tool result without any envelope to unwrap."
  ([body] (refusal! 400 body))
  ([status body]
   (let [response (browse! :rasta status body)]
     (if (string? response) response (pr-str response)))))

;;; ──────────────────────────────────────────────────────────────────
;;; The action contract
;;; ──────────────────────────────────────────────────────────────────

(deftest unknown-action-is-refused-at-the-schema-test
  (is (some? (browse! :rasta 400 {:action "list_everything"}))))

(deftest missing-database-id-is-a-teaching-error-test
  (doseq [action ["list_schemas" "list_tables" "list_models"]]
    (testing action
      (let [message (refusal! {:action action})]
        (is (re-find #"database_id" message))
        (is (re-find #"list_databases" message))))))

(deftest misdirected-arguments-are-teaching-errors-test
  (testing "arguments that belong to another action are refused, not silently ignored"
    (is (re-find #"`schema` only scopes `list_tables`"
                 (refusal! {:action "list_schemas" :database_id (mt/id) :schema "PUBLIC"})))
    (is (re-find #"`search` only filters `list_tables`"
                 (refusal! {:action "list_databases" :search "orders"})))
    (is (re-find #"`table_ids` only applies to `get_fields`"
                 (refusal! {:action "list_tables" :database_id (mt/id) :table_ids [1]})))))

;;; ──────────────────────────────────────────────────────────────────
;;; list_databases
;;; ──────────────────────────────────────────────────────────────────

(deftest list-databases-test
  (mt/id)
  (let [response (browse! {:action "list_databases"})
        by-id    (into {} (map (juxt :id identity)) (:data response))
        row      (get by-id (mt/id))]
    (testing "the test database is in the listing, in the concise projection"
      (is (some? row))
      (is (= "h2" (:engine row)))
      (is (= #{:id :name :engine} (set (keys row)))
          "concise database rows carry the projection's fields and nothing else"))
    (testing "the envelope carries an exact total"
      (is (= (:total response) (count (:data response)) (:returned response))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list_schemas
;;; ──────────────────────────────────────────────────────────────────

(deftest list-schemas-test
  (testing "schemas are the same strings the REST endpoint returns"
    (is (contains? (set (:data (browse! {:action "list_schemas" :database_id (mt/id)})))
                   "PUBLIC")))
  (testing "a schema whose only table is hidden appears only under include_hidden"
    (mt/with-temp [:model/Table _ {:db_id           (mt/id)
                                   :schema          "AGENTV2_HIDDEN_SCHEMA"
                                   :name            "AGENTV2_HIDDEN_TABLE"
                                   :visibility_type "hidden"}]
      (is (not (contains? (set (:data (browse! {:action "list_schemas" :database_id (mt/id)})))
                          "AGENTV2_HIDDEN_SCHEMA")))
      (is (contains? (set (:data (browse! {:action         "list_schemas"
                                           :database_id    (mt/id)
                                           :include_hidden true})))
                     "AGENTV2_HIDDEN_SCHEMA")))))

;;; ──────────────────────────────────────────────────────────────────
;;; list_tables
;;; ──────────────────────────────────────────────────────────────────

(deftest list-tables-test
  (testing "no schema lists the whole database"
    (is (contains? (set (map :name (:data (browse! {:action "list_tables" :database_id (mt/id)}))))
                   "ORDERS")))
  (testing "schema scopes, search substring-filters, and rows are the concise table projection"
    (mt/with-temp [:model/Table _ {:db_id (mt/id) :schema "AGENTV2_SCOPE" :name "AGENTV2_ALPHA"}
                   :model/Table _ {:db_id (mt/id) :schema "AGENTV2_SCOPE" :name "AGENTV2_BETA"}
                   :model/Table _ {:db_id (mt/id) :schema "AGENTV2_OTHER" :name "AGENTV2_GAMMA"}]
      (let [scoped (browse! {:action "list_tables" :database_id (mt/id) :schema "AGENTV2_SCOPE"})]
        (is (= #{"AGENTV2_ALPHA" "AGENTV2_BETA"} (set (map :name (:data scoped)))))
        (is (set/subset? #{:id :name :display_name :schema :db_id}
                         (set (keys (first (:data scoped)))))))
      (is (= ["AGENTV2_BETA"]
             (map :name (:data (browse! {:action      "list_tables"
                                         :database_id (mt/id)
                                         :search      "v2_bet"})))))))
  (testing "a hidden table appears only under include_hidden"
    (mt/with-temp [:model/Table _ {:db_id           (mt/id)
                                   :schema          "PUBLIC"
                                   :name            "AGENTV2_HIDDEN"
                                   :visibility_type "hidden"}]
      (let [names #(set (map :name (:data (browse! (merge {:action "list_tables" :database_id (mt/id)} %)))))]
        (is (not (contains? (names {}) "AGENTV2_HIDDEN")))
        (is (contains? (names {:include_hidden true}) "AGENTV2_HIDDEN")))))
  (testing "an unknown schema is a teaching error naming list_schemas, mirroring REST's 404"
    (is (re-find #"list_schemas"
                 (refusal! 404 {:action "list_tables" :database_id (mt/id) :schema "NO_SUCH_SCHEMA"})))))

(deftest list-tables-pagination-test
  (mt/with-temp [:model/Table _ {:db_id (mt/id) :schema "AGENTV2_PAGE" :name "AGENTV2_P1"}
                 :model/Table _ {:db_id (mt/id) :schema "AGENTV2_PAGE" :name "AGENTV2_P2"}
                 :model/Table _ {:db_id (mt/id) :schema "AGENTV2_PAGE" :name "AGENTV2_P3"}]
    (let [page-1 (browse! {:action "list_tables" :database_id (mt/id) :schema "AGENTV2_PAGE" :limit 2})
          page-2 (browse! {:action "list_tables" :database_id (mt/id) :schema "AGENTV2_PAGE" :limit 2 :offset 2})]
      (testing "a cut page says so, and the message names the scope, the narrowing param, and the next offset"
        (is (= 2 (:returned page-1)))
        (is (= 3 (:total page-1)))
        (is (true? (:truncated page-1)))
        (is (re-find #"in schema `AGENTV2_PAGE`" (:truncation_message page-1)))
        (is (re-find #"`search`" (:truncation_message page-1)))
        (is (re-find #"`offset: 2`" (:truncation_message page-1))))
      (testing "the next offset returns the rest"
        (is (= 1 (:returned page-2)))
        (is (not (contains? page-2 :truncated)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list_models
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-test
  (mt/with-temp [:model/Collection coll  {}
                 :model/Card       model {:name          "AgentV2 Model"
                                          :type          :model
                                          :database_id   (mt/id)
                                          :dataset_query (mt/mbql-query venues {:limit 1})}
                 :model/Card       _     {:name          "AgentV2 Question"
                                          :type          :question
                                          :database_id   (mt/id)
                                          :dataset_query (mt/mbql-query venues {:limit 1})}
                 :model/Card       _     {:name          "AgentV2 Hidden Model"
                                          :type          :model
                                          :database_id   (mt/id)
                                          :collection_id (:id coll)
                                          :dataset_query (mt/mbql-query venues {:limit 1})}]
    (mt/with-non-admin-groups-no-collection-perms coll
      (let [names (fn [user] (set (map :name (:data (browse! user 200 {:action "list_models" :database_id (mt/id)})))))]
        (testing "only models on the database, in the concise card projection"
          (is (contains? (names :rasta) "AgentV2 Model"))
          (is (not (contains? (names :rasta) "AgentV2 Question")))
          (is (= "model" (:type (some #(when (= (:id model) (:id %)) %)
                                      (:data (browse! {:action "list_models" :database_id (mt/id)})))))))
        (testing "permission-filtered: a model in a collection the caller cannot read is not listed"
          (is (not (contains? (names :rasta) "AgentV2 Hidden Model")))
          (is (contains? (names :crowberto) "AgentV2 Hidden Model")))))))

;;; ──────────────────────────────────────────────────────────────────
;;; get_fields
;;; ──────────────────────────────────────────────────────────────────

(deftest get-fields-test
  (let [response (browse! {:action "get_fields" :table_ids [(mt/id :orders) (mt/id :categories)]})
        tables   (:data response)]
    (testing "every requested table comes back complete, in request order"
      (is (= [(mt/id :orders) (mt/id :categories)] (map :id tables)))
      (is (= 2 (:returned response) (count tables)))
      (is (= 2 (:total response)))
      (is (not (contains? response :omitted))))
    (testing "concise field rows are the field projection — nothing else"
      (let [field (first (:fields (first tables)))]
        (is (= #{:id :name :display_name :description :base_type :semantic_type
                 :table_id :fk_target_field_id}
               (set (keys field))))))
    (testing "field ids and names are the table's own"
      (is (contains? (set (map :name (:fields (second tables)))) "NAME")))))

(deftest get-fields-argument-contract-test
  (testing "get_fields without table_ids names the fix"
    (is (re-find #"table_ids" (refusal! {:action "get_fields"}))))
  (testing "more than 20 tables is a refusal, not a bigger response"
    (is (re-find #"at most 20"
                 (refusal! {:action "get_fields" :table_ids (vec (range 1 23))}))))
  (testing "offset only continues a single table"
    (is (re-find #"single table"
                 (refusal! {:action "get_fields"
                            :table_ids [(mt/id :orders) (mt/id :venues)]
                            :offset 10}))))
  (testing "limit belongs to the list actions"
    (is (re-find #"response budget"
                 (refusal! {:action "get_fields" :table_ids [(mt/id :orders)] :limit 10})))))

(deftest get-fields-hidden-fields-test
  (mt/with-temp [:model/Table t {:db_id (mt/id) :schema "PUBLIC" :name "AGENTV2_FIELDS"}
                 :model/Field _ {:table_id (:id t) :name "VISIBLE" :base_type :type/Text}
                 :model/Field _ {:table_id (:id t) :name "GHOST" :base_type :type/Text
                                 :visibility_type "hidden"}]
    (let [field-names (fn [params]
                        (->> (browse! (merge {:action "get_fields" :table_ids [(:id t)]} params))
                             :data first :fields (map :name) set))]
      (is (= #{"VISIBLE"} (field-names {})))
      (is (= #{"VISIBLE" "GHOST"} (field-names {:include_hidden true}))))))

(deftest get-fields-unknown-table-is-named-back-test
  (testing "an id that names nothing lands in omitted with the reason, never a silent absence"
    (let [response (browse! {:action "get_fields" :table_ids [(mt/id :orders) 123456789]})]
      (is (= [(mt/id :orders)] (map :id (:data response))))
      (is (=? [{:id 123456789 :reason #"not found.*"}] (:omitted response))))))

;;; ──────────────────────────────────────────────────────────────────
;;; get_fields — the response budget
;;; ──────────────────────────────────────────────────────────────────

(defn- with-wide-table
  "Run `f` with a temp table carrying `n` fat-description fields — wide enough that its concise unit
   alone exceeds the response budget."
  [n f]
  (mt/with-temp [:model/Table table {:db_id (mt/id) :schema "PUBLIC" :name "AGENTV2_WIDE"}]
    (t2/insert! :model/Field
                (for [i (range n)]
                  {:table_id      (:id table)
                   :name          (format "WIDE_FIELD_%03d" i)
                   :base_type     :type/Text
                   :database_type "TEXT"
                   :position      i
                   :description   (apply str (repeat 120 "x"))}))
    (f table)))

(deftest get-fields-slices-a-wide-table-wherever-it-appears-test
  (with-wide-table
    400
    (fn [wide]
      (testing "a table too wide for a response of its own is sliced even when another table was asked for
                first — the alternative omits it, and an agent that asked for its fields never gets them"
        (let [response (browse! {:action "get_fields" :table_ids [(mt/id :categories) (:id wide)]})
              table    (first (:data response))]
          (is (= [(:id wide)] (map :id (:data response))))
          (is (= 400 (:total table)))
          (is (< 0 (:returned table) 400))
          (is (true? (:truncated response)))
          (is (re-find #"offset" (:truncation_message response)))
          (testing "and the tables that made way for the slice are named, never silently absent"
            (is (=? [{:id (mt/id :categories) :reason #"response budget.*"}]
                    (:omitted response)))))))))

(deftest get-fields-budget-cuts-whole-tables-test
  (testing "tables that each fit but together overrun the budget come back complete until the budget runs
            out, and the rest are named — never half a table"
    (let [ids      (mapv mt/id [:orders :people :products :reviews :venues :checkins :users :categories])
          response (browse! {:action "get_fields" :table_ids ids :response_format "detailed"})]
      (is (= (count ids) (:total response)))
      (is (pos? (:returned response)))
      (is (every? (fn [table] (= (count (:fields table)) (count (distinct (map :id (:fields table))))))
                  (:data response))
          "every returned table carries its whole field list")
      (when (:truncated response)
        (is (re-find #"response budget" (:truncation_message response)))
        (is (= (- (count ids) (:returned response)) (count (:omitted response))))
        (is (every? #(re-find #"response budget" (:reason %)) (:omitted response)))))))

(deftest get-fields-single-wide-table-slices-explicitly-test
  (with-wide-table
    400
    (fn [wide]
      (let [response (browse! {:action "get_fields" :table_ids [(:id wide)]})
            table    (first (:data response))]
        (testing "the one-table-over-budget case is an explicit position-ordered slice, not an omission"
          (is (= (:id wide) (:id table)))
          (is (= 400 (:total table)))
          (is (< 0 (:returned table) 400))
          (is (= "WIDE_FIELD_000" (:name (first (:fields table)))))
          (is (= (:returned table) (count (:fields table)))))
        (testing "and the truncation message names the continuation offset"
          (is (true? (:truncated response)))
          (is (re-find (re-pattern (str "offset: " (:returned table))) (:truncation_message response))))
        (testing "continuing from the named offset returns the next fields"
          (let [continued (browse! {:action    "get_fields"
                                    :table_ids [(:id wide)]
                                    :offset    (:returned table)})
                next-table (first (:data continued))]
            (is (= (format "WIDE_FIELD_%03d" (:returned table))
                   (:name (first (:fields next-table)))))))
        (testing "an offset past the end teaches rather than returning an empty slice"
          (is (re-find #"past the end"
                       (refusal! {:action "get_fields" :table_ids [(:id wide)] :offset 1000}))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; get_fields — detailed
;;; ──────────────────────────────────────────────────────────────────

(deftest get-fields-detailed-test
  (mt/with-temp [:model/Table       t {:db_id (mt/id) :schema "PUBLIC" :name "AGENTV2_DETAILED"}
                 :model/Field       f {:table_id         (:id t)
                                       :name             "STATUS"
                                       :base_type        :type/Text
                                       :has_field_values "list"}
                 :model/FieldValues _ {:field_id (:id f) :values ["active" "inactive"]}
                 :model/Card        _ {:name          "AgentV2 Derived Question"
                                       :dataset_query {:database (mt/id)
                                                       :type     :query
                                                       :query    {:source-table (:id t)}}}]
    (let [response     (browse! {:action          "get_fields"
                                 :table_ids       [(:id t)]
                                 :response_format "detailed"})
          table        (first (:data response))
          status-field (some #(when (= "STATUS" (:name %)) %) (:fields table))]
      (testing "detailed field rows carry the whole REST record"
        (is (contains? status-field :has_field_values))
        (is (contains? status-field :fingerprint)))
      (testing "a list-valued field carries sample values, resolved through the field-values path"
        (is (= ["active" "inactive"] (:values status-field))))
      (testing "and the table carries its derived content"
        (is (contains? (set (map :name (get-in table [:derived :cards])))
                       "AgentV2 Derived Question"))))))

(deftest get-fields-concise-stays-concise-test
  (let [field (->> (browse! {:action "get_fields" :table_ids [(mt/id :categories)]})
                   :data first :fields first)]
    (is (not (contains? field :fingerprint)))
    (is (not (contains? field :values)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Read events
;;; ──────────────────────────────────────────────────────────────────

(deftest get-fields-leaves-the-table-read-trail-test
  (testing "a get_fields read publishes :event/table-read, so the table lands in the caller's recents
            exactly as an app table view does"
    (mt/with-test-user :rasta
      (browse-data/browse-data {:action "get_fields" :table_ids [(mt/id :orders)]})
      (is (contains? (into #{}
                           (map (juxt :model :id))
                           (:recents (activity-feed/get-recents (mt/user->id :rasta) [:views])))
                     [:table (mt/id :orders)])))))

;;; ──────────────────────────────────────────────────────────────────
;;; fields — dot-path picks on the list_* actions
;;; ──────────────────────────────────────────────────────────────────

(deftest list-tables-fields-test
  (testing "`fields` picks exactly the named paths from a row, and overrides response_format"
    (let [rows (:data (browse! {:action          "list_tables"
                                :database_id     (mt/id)
                                :search          "orders"
                                :fields          ["id" "name"]
                                :response_format "detailed"}))]
      (is (= [#{:id :name}] (distinct (map (comp set keys) rows))))))
  (testing "an unknown path is refused, naming the paths that exist"
    (let [message (refusal! {:action "list_tables" :database_id (mt/id) :fields ["naem"]})]
      (is (re-find #"Unknown field \"naem\"" message))
      (is (re-find #"Did you mean \"name\"\?" message))))
  (testing "`fields` has nothing to pick from a bare schema name, or from a table unit's own field list"
    (is (re-find #"`fields` picks fields from a record"
                 (refusal! {:action "list_schemas" :database_id (mt/id) :fields ["name"]})))
    (is (re-find #"`fields` picks fields from a record"
                 (refusal! {:action "get_fields" :table_ids [(mt/id :orders)] :fields ["name"]})))))

(deftest list-tables-without-a-schema-spans-every-schema-test
  (testing "an unscoped list_tables is the database's tables, across every schema it has — one listing, not
            one per schema"
    (let [tables (:data (browse! {:action "list_tables" :database_id (mt/id) :limit 200}))]
      (is (= (set (map :name (:data (browse! {:action      "list_tables"
                                              :database_id (mt/id)
                                              :schema      "PUBLIC"
                                              :limit       200}))))
             (set (map :name tables)))
          "the sample database has one schema, so the scoped and unscoped listings agree")
      (is (contains? (set (map :name tables)) "ORDERS")))))
