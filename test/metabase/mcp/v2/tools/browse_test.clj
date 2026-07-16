(ns metabase.mcp.v2.tools.browse-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.tools.browse :as browse]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private byte-budget @#'browse/get-fields-byte-budget)

(defn- call!
  "Invoke the tool handler and return `[envelope steering-line]` — the parsed JSON body and the
   trailing steering sentence, which the handler appends to the text block after a newline."
  [args]
  (let [text           (-> (browse/browse-data args {}) :content first :text)
        [body & rest*] (str/split-lines text)]
    [(json/decode+kw body) (when (seq rest*) (str/join "\n" rest*))]))

(defn- field-payload
  "A field whose JSON encoding is at least `size` bytes."
  [i size]
  {:id i :name (str "field_" i) :description (apply str (repeat size \x))})

(defn- table-payload
  [id field-count field-size]
  {:id     id
   :name   (str "table_" id)
   :fields (mapv #(field-payload % field-size) (range field-count))})

;;; -------------------------------------------- Per-action validation ---------------------------------------------

(deftest ^:parallel validate-args-for-action-required-test
  (testing "GHY-4138: a missing required arg is a teaching error naming the arg, per action"
    (are [action] (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"`database_id` is required for action"
                   (#'browse/validate-args-for-action! {:action action}))
      "list_schemas"
      "list_tables"
      "list_models")
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"`table_ids` is required for action get_fields\."
         (#'browse/validate-args-for-action! {:action "get_fields"})))))

(deftest ^:parallel validate-args-for-action-rejects-inapplicable-test
  (testing "GHY-4138: an arg belonging to another action is a teaching error naming the fix"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"`search` does not apply to action list_models — remove it\."
         (#'browse/validate-args-for-action! {:action "list_models" :database_id 1 :search "x"})))
    (testing "several inapplicable args are listed together, sorted, with plural agreement"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"`schema`, `search` do not apply to action list_models — remove them\."
           (#'browse/validate-args-for-action! {:action "list_models" :database_id 1
                                                :schema  "s"          :search      "x"}))))
    (testing "`fields`/`response_format` are rejected for list_schemas, which has no projection"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"`fields` does not apply to action list_schemas"
           (#'browse/validate-args-for-action! {:action "list_schemas" :database_id 1
                                                :fields ["name"]}))))))

(deftest ^:parallel validate-args-for-action-accepts-documented-args-test
  (testing "GHY-4138: each action accepts every arg its schema documents for it"
    (are [args] (nil? (#'browse/validate-args-for-action! args))
      {:action "list_databases" :limit 10 :offset 0 :response_format "detailed"}
      {:action "list_databases" :fields ["name"]}
      {:action "list_schemas"   :database_id 1 :include_hidden true :limit 5 :offset 5}
      {:action "list_tables"    :database_id 1 :schema "public" :search "x" :fields ["name"]}
      {:action "list_tables"    :database_id 1 :include_hidden true :limit 1 :offset 2
       :response_format         "concise"}
      {:action "list_models"    :database_id 1 :limit 5 :offset 0 :response_format "detailed"}
      {:action "get_fields"     :table_ids [1 2] :include_hidden true}
      {:action "get_fields"     :table_ids [1] :offset 10 :response_format "detailed"})))

;;; ---------------------------------------------- get_fields guards -----------------------------------------------

(deftest ^:parallel get-fields-guards-test
  (testing "GHY-4138: get_fields rejects an empty id list rather than returning an empty response"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"`table_ids` must name at least one table\."
         (#'browse/get-fields {:action "get_fields" :table_ids []}))))
  (testing "GHY-4138: the 20-id cap is a teaching error naming the count passed and the fix"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"`table_ids` accepts at most 20 ids per call — you passed 21; split the request\."
         (#'browse/get-fields {:action "get_fields" :table_ids (vec (range 1 22))}))))
  (testing "GHY-4138: `offset` pages one table's fields, so it is meaningless across several"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"`offset` with get_fields pages the fields of one large table"
         (#'browse/get-fields {:action "get_fields" :table_ids [1 2] :offset 5})))))

;;; ------------------------------------------------ Byte budget ---------------------------------------------------

(deftest ^:parallel assemble-tables-within-budget-test
  (testing "GHY-4138: when every table fits, all are returned whole in request order"
    (let [payloads [(table-payload 1 2 10) (table-payload 2 2 10) (table-payload 3 2 10)]]
      (is (= {:tables payloads :omitted []}
             (#'browse/assemble-tables payloads nil))))))

(deftest ^:parallel assemble-tables-omits-whole-tables-past-budget-test
  (testing "GHY-4138: tables past the byte budget are named under :omitted, never silently cut"
    ;; ~62KB each: the first fits the 100KB budget, the second would blow it.
    (let [payloads (mapv #(table-payload % 60 1000) [1 2 3])
          {:keys [tables omitted]} (#'browse/assemble-tables payloads nil)]
      (is (= [1] (map :id tables)))
      (testing "the table that made the cut is whole, not truncated"
        (is (= 60 (count (:fields (first tables)))))
        (is (not (contains? (first tables) :total_fields))
            "a whole table carries no slice bookkeeping"))
      (testing "omitted tables are identified by name and steered to a separate call"
        (is (= [{:id 2 :name "table_2" :reason "response budget — request in a separate call"}
                {:id 3 :name "table_3" :reason "response budget — request in a separate call"}]
               omitted))))))

(deftest ^:parallel assemble-tables-oversized-first-table-slices-test
  (testing "GHY-4138: one table larger than the whole budget degrades to a field slice, not an error"
    (let [payloads [(table-payload 1 200 1000)]
          {:keys [tables omitted message]} (#'browse/assemble-tables payloads nil)
          table    (first tables)]
      (is (= 1 (count tables)))
      (is (= [] omitted))
      (is (= 200 (:total_fields table)))
      (is (= 0 (:offset table)))
      (testing "the slice is cut to fit and steers to the next offset"
        (is (< 0 (count (:fields table)) 200))
        (is (re-find #"continue with `offset: \d+`\." message))))))

(deftest ^:parallel assemble-tables-explicit-offset-slices-test
  (testing "GHY-4138: an explicit offset pages one table's fields even when it would fit whole"
    (let [{:keys [tables message]} (#'browse/assemble-tables [(table-payload 1 3 10)] 1)
          table (first tables)]
      (is (= 1 (:offset table)))
      (is (= 3 (:total_fields table)))
      (is (= ["field_1" "field_2"] (map :name (:fields table))))
      (is (nil? message) "the final page carries no continuation message"))))

(deftest ^:parallel assemble-tables-empty-test
  (testing "GHY-4138: no readable tables yields an empty result rather than entering the slice path"
    (is (= {:tables [] :omitted []} (#'browse/assemble-tables [] nil)))
    (is (= {:tables [] :omitted []} (#'browse/assemble-tables [] 0)))))

(deftest ^:parallel slice-table-payload-always-advances-test
  (testing "GHY-4138: a single field larger than the whole budget is still returned alone, so paging
            can never stall"
    (let [{:keys [payload message]}
          (#'browse/slice-table-payload
           {:id 1 :name "t" :fields [(field-payload 0 (* 2 byte-budget)) (field-payload 1 10)]}
           0)]
      (is (= 1 (count (:fields payload))))
      (is (= 2 (:total_fields payload)))
      (is (re-find #"continue with `offset: 1`\." message)))))

(deftest ^:parallel slice-table-payload-message-names-table-test
  (testing "GHY-4138: the continuation message names the table and its exact next offset"
    (let [{:keys [payload message]}
          (#'browse/slice-table-payload (table-payload 7 200 1000) 0)]
      (is (str/starts-with? message "table_7: "))
      (is (re-find #"of 200 fields" message))
      (testing "the named next offset is exactly the field count returned"
        (is (re-find (re-pattern (str "continue with `offset: " (count (:fields payload)) "`"))
                     message))))))

(deftest ^:parallel slice-table-payload-final-page-test
  (testing "GHY-4138: the last page returns the remaining fields and no continuation message"
    (let [{:keys [payload message]}
          (#'browse/slice-table-payload (table-payload 1 3 10) 2)]
      (is (= ["field_2"] (map :name (:fields payload))))
      (is (= 3 (:total_fields payload)))
      (is (nil? message)))))

;;; ------------------------------------------- Permission filtering -----------------------------------------------
;;; These mutate global permission rows via `with-no-data-perms-for-all-users!`, so they are not `^:parallel`.

(deftest list-databases-permission-filtered-test
  (testing "GHY-4138: list_databases returns only databases the caller can read"
    (mt/with-temp [:model/Database {db-id :id} {:name "Browse Test DB"}
                   :model/Table    {t-id :id} {:db_id db-id :schema "public" :name "t"}]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-test-user :rasta
          (let [[envelope] (call! {:action "list_databases" :limit 500})]
            (is (not (contains? (set (map :id (:data envelope))) db-id))
                "a database the caller has no perms on is absent from the listing")))
        ;; Database visibility keys off create-queries, not view-data — see the `mi/can-read?`
        ;; impl for :model/Database.
        (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
        (data-perms/set-table-permission! (perms-group/all-users) t-id :perms/create-queries :query-builder)
        (mt/with-test-user :rasta
          (let [[envelope] (call! {:action "list_databases" :limit 500})]
            (is (contains? (set (map :id (:data envelope))) db-id)
                "granting query-builder access makes it visible")))))))

(deftest list-schemas-permission-filtered-test
  (testing "GHY-4138: list_schemas returns only schemas the caller has some access to"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {t1-id :id} {:db_id db-id :schema "readable"}
                   :model/Table    _           {:db_id db-id :schema "secret"}]
      (mt/with-no-data-perms-for-all-users!
        (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
        (data-perms/set-table-permission! (perms-group/all-users) t1-id :perms/create-queries :query-builder)
        (mt/with-test-user :rasta
          (let [[envelope] (call! {:action "list_schemas" :database_id db-id})]
            (is (= ["readable"] (:data envelope)))
            (is (= 1 (:total envelope)))))))))

(deftest list-tables-schema-existence-collapse-test
  (testing "GHY-4138: a schema that exists but is off-limits and one that was never there answer
            identically, so listings never form an existence oracle across the permission boundary"
    (mt/with-temp [:model/Database {db-id :id}  {}
                   :model/Table    {t1-id :id}  {:db_id db-id :schema "readable"
                                                 :name  "visible_table" :display_name "Visible Table"}
                   :model/Table    _            {:db_id db-id :schema "secret"
                                                 :name  "secret_table" :display_name "Secret Table"}]
      (mt/with-no-data-perms-for-all-users!
        (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
        (data-perms/set-table-permission! (perms-group/all-users) t1-id :perms/create-queries :query-builder)
        (mt/with-test-user :rasta
          (testing "the readable schema lists its tables"
            (let [[envelope] (call! {:action "list_tables" :database_id db-id :schema "readable"})]
              (is (= ["visible_table"] (map :name (:data envelope))))))
          (testing "the off-limits schema and the nonexistent one raise the same teaching error"
            (are [schema] (thrown-with-msg?
                           clojure.lang.ExceptionInfo
                           #"not found in database \d+ — it may not exist, or you may not have access to it\."
                           (browse/browse-data {:action      "list_tables"
                                                :database_id db-id
                                                :schema      schema}
                                               {}))
              "secret"
              "no-such-schema")))))))

(deftest list-tables-search-test
  (testing "GHY-4138: `search` is a case-insensitive substring filter applied before paging"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    _ {:db_id db-id :schema "public" :name "orders"      :display_name "Orders"}
                   :model/Table    _ {:db_id db-id :schema "public" :name "order_items" :display_name "Order Items"}
                   :model/Table    _ {:db_id db-id :schema "public" :name "people"      :display_name "People"}]
      (mt/with-full-data-perms-for-all-users!
        (mt/with-test-user :rasta
          (let [[envelope] (call! {:action "list_tables" :database_id db-id
                                   :schema "public"      :search      "ORDER"})]
            (is (= #{"orders" "order_items"} (set (map :name (:data envelope)))))
            (is (= 2 (:total envelope))
                "total reflects the filtered set, not the whole schema")))))))

(deftest list-tables-paging-test
  (testing "GHY-4138: limit/offset page the filtered set and steer with a truncation line"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    _ {:db_id db-id :schema "public" :name "t1" :display_name "A Table"}
                   :model/Table    _ {:db_id db-id :schema "public" :name "t2" :display_name "B Table"}
                   :model/Table    _ {:db_id db-id :schema "public" :name "t3" :display_name "C Table"}]
      (mt/with-full-data-perms-for-all-users!
        (mt/with-test-user :rasta
          (let [[envelope line] (call! {:action "list_tables" :database_id db-id
                                        :schema "public"      :limit       2})]
            (is (= 2 (:returned envelope)))
            (is (= 3 (:total envelope)))
            (is (= ["t1" "t2"] (map :name (:data envelope))))
            (is (= "Returned 2 of 3 — narrow with `search`, or continue with `offset: 2`." line)))
          (testing "the final page carries no steering line"
            (let [[envelope line] (call! {:action "list_tables" :database_id db-id :schema "public"
                                          :limit  2            :offset      2})]
              (is (= 1 (:returned envelope)))
              (is (= ["t3"] (map :name (:data envelope))))
              (is (nil? line)))))))))

(deftest list-models-test
  (testing "GHY-4138: list_models returns the database's models and nothing else"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {t-id :id} {:db_id db-id :schema "public" :name "orders"}
                   :model/Card     _ {:name "Orders Model" :type :model
                                      :database_id db-id :table_id t-id}
                   :model/Card     _ {:name "Plain Question" :type :question
                                      :database_id db-id :table_id t-id}]
      (mt/with-full-data-perms-for-all-users!
        (mt/with-test-user :crowberto
          (let [[envelope] (call! {:action "list_models" :database_id db-id})]
            (is (= ["Orders Model"] (map :name (:data envelope)))
                "plain questions are excluded — only :type :model")
            (is (= 1 (:total envelope))))
          (testing "every key the detailed projection advertises survives the narrowed column
                    select — a projection key with no matching column would come back missing"
            (let [[envelope] (call! {:action "list_models" :database_id db-id
                                     :response_format "detailed"})]
              (is (= (set projections/question-detailed-keys)
                     (set (keys (first (:data envelope)))))))))))))

(deftest list-models-permission-filtered-test
  (testing "GHY-4138: list_models filters models by their parent collection's read perms, which
            is why :collection_id has to survive the narrowed column select"
    (mt/with-temp [:model/Database   {db-id :id}  {}
                   :model/Table      {t-id :id}   {:db_id db-id :schema "public" :name "orders"}
                   :model/Collection {open-id :id}   {}
                   :model/Collection {closed-id :id} {}
                   :model/Card       _ {:name "Open Model" :type :model :database_id db-id
                                        :table_id t-id :collection_id open-id}
                   :model/Card       _ {:name "Closed Model" :type :model :database_id db-id
                                        :table_id t-id :collection_id closed-id}]
      (mt/with-full-data-perms-for-all-users!
        (perms/grant-collection-read-permissions! (perms-group/all-users) open-id)
        (perms/revoke-collection-permissions! (perms-group/all-users) closed-id)
        (mt/with-test-user :rasta
          (let [[envelope] (call! {:action "list_models" :database_id db-id})]
            (is (= ["Open Model"] (map :name (:data envelope))))
            (is (= 1 (:total envelope))
                "total counts the permission-filtered set, not every model on the database")))))))

(deftest get-fields-missing-table-omitted-test
  (testing "GHY-4138: an id that is absent or unreadable lands in :omitted with the collapsed
            not-found reason rather than failing the whole call"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {t-id :id} {:db_id db-id :schema "public"
                                               :name  "orders" :display_name "Orders"}
                   :model/Field    _ {:table_id t-id :name "id" :base_type :type/Integer
                                      :semantic_type :type/PK :position 0}]
      (mt/with-full-data-perms-for-all-users!
        (mt/with-test-user :rasta
          (let [absent-id  Integer/MAX_VALUE
                [envelope] (call! {:action "get_fields" :table_ids [t-id absent-id]})]
            (is (= [t-id] (map :id (:tables envelope)))
                "the readable table still comes back whole")
            (is (= ["id"] (map :name (:fields (first (:tables envelope))))))
            (is (= [{:id     absent-id
                     :reason "not found — it may not exist, or you may not have access to it"}]
                   (:omitted envelope)))))))))

(deftest get-fields-database-not-found-collapse-test
  (testing "GHY-4138: an unreadable database is reported exactly as a nonexistent one"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    _ {:db_id db-id :schema "public" :name "t"}]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-test-user :rasta
          (are [id] (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"database \d+ not found — it may not exist, or you may not have access to it\."
                     (browse/browse-data {:action "list_schemas" :database_id id} {}))
            db-id
            Integer/MAX_VALUE))))))
