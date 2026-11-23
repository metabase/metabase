(ns metabase.sync.metadata-sync.send-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.send :as send]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- add-tables!
  "Add Tables, each `[schema name field-names]`, to the Database with `db-id`, and return their ids by name."
  [db-id tables]
  (into {}
        (for [[table-schema table-name field-names] tables]
          (let [table-id (t2/insert-returning-pk! :model/Table {:db_id db-id :schema table-schema :name table-name
                                                                :active true})]
            (doseq [[i field-name] (map-indexed vector field-names)]
              (t2/insert! :model/Field {:table_id table-id :name field-name :base_type :type/Text
                                        :database_type "TEXT" :position i :database_position i}))
            [table-name table-id]))))

(defn- field-id [table-id field-name]
  (t2/select-one-pk :model/Field :table_id table-id :name field-name))

(def ^:private some-tables
  [[nil "loose" ["a"]]
   ["PUBLIC" "orders" ["id" "total" "user_id"]]
   ["PUBLIC" "people" ["id" "name"]]
   ["SALES" "leads" ["id" "email"]]])

(defn- add-links-and-stats!
  "Give the Tables with `tables` ids an FK from orders.user_id to people.id, a row count on orders and field values on
  orders.total."
  [tables]
  (t2/update! :model/Field :id (field-id (tables "orders") "user_id")
              {:fk_target_field_id (field-id (tables "people") "id")})
  (t2/update! :model/Table :id (tables "orders") {:estimated_row_count 3})
  (t2/update! :model/Field :id (field-id (tables "orders") "total") {:has_field_values :list})
  (t2/insert! :model/FieldValues {:field_id (field-id (tables "orders") "total") :type :full :values ["1" "2"]}))

(defn- through-json [x]
  (json/decode+kw (json/encode x)))

(defn- answer
  "The answer to a request for the h2 Database named `database-name`, with `more` keys, through JSON both ways."
  ([database-name]
   (answer database-name {}))
  ([database-name more]
   (through-json (send/changes-response (through-json (merge {:database database-name :engine "h2"} more))))))

(defn- answers
  "Every answer for the Database named `database-name`, from the first to the one with no `next`."
  ([database-name]
   (answers database-name {}))
  ([database-name more]
   (loop [after nil acc []]
     (let [response (answer database-name (cond-> more after (assoc :after after)))
           acc      (conj acc response)]
       (cond
         (nil? (:next response)) acc
         (> (count acc) 100)     (throw (ex-info "the answers do not end" {}))
         :else                   (recur (:next response) acc))))))

(defn- batch-keys
  "The `[schema name]` of each Table in the batches of `kind` in `responses`, in order."
  [kind responses]
  (into []
        (comp (mapcat :batches)
              (filter (comp #{kind} :type))
              (mapcat :tables)
              (map (juxt :schema :name)))
        responses))

(defn- types [response]
  (mapv :type (:batches response)))

(deftest kinds-in-order-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"
                                                            :timezone            "UTC"
                                                            :dbms_version        {:flavor "H2"}}]
    (add-links-and-stats! (add-tables! db-id some-tables))
    (let [responses (answers db-name)]
      (testing "each answer is valid, of this format version"
        (is (every? #(mr/validate ::wire/response %) responses))
        (is (every? #(= wire/format-version (:format_version %)) responses)))
      (testing "the database values come first, then the tables, then the links, then the stats"
        (is (= [["database" "tables"] ["links"] ["stats"]] (mapv types responses))))
      (testing "the database batch holds the database values"
        (is (= {:type "database" :timezone "UTC" :dbms_version {:flavor "H2"}}
               (first (:batches (first responses))))))
      (testing "the tables are every Table, in key order: a nil schema first"
        (is (= [[nil "loose"] ["PUBLIC" "orders"] ["PUBLIC" "people"] ["SALES" "leads"]]
               (batch-keys "tables" responses))))
      (testing "the links are the FK, by name"
        (is (= [{:schema "PUBLIC" :name "orders"
                 :links  [{:kind "fk" :field ["user_id"] :target {:schema "PUBLIC" :table "people" :field ["id"]}}]}]
               (-> responses second :batches first :tables))))
      (testing "the stats are the row count and the field values"
        (is (= [{:schema              "PUBLIC"
                 :name                "orders"
                 :estimated_row_count 3
                 :field_values        [{:field ["total"] :values ["1" "2"] :has_more_values false}]}]
               (-> responses last :batches first :tables))))
      (testing "the cursors name the next kind"
        (is (= [{:kind "links"} {:kind "stats"} nil] (mapv :next responses)))))))

(deftest tables-in-pages-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (add-tables! db-id some-tables)
    (with-redefs [pages/table-field-limit 6]
      (let [responses (answers db-name)]
        (testing "a small limit cuts the tables into several answers: a Table weighs its Fields and one more"
          (is (= [[[nil "loose"] ["PUBLIC" "orders"]] [["PUBLIC" "people"] ["SALES" "leads"]]]
                 (mapv #(batch-keys "tables" [%]) responses))))
        (testing "each Table is sent once, in key order"
          (is (= [[nil "loose"] ["PUBLIC" "orders"] ["PUBLIC" "people"] ["SALES" "leads"]]
                 (batch-keys "tables" responses))))
        (testing "a cursor names the last Table that its answer covered"
          (is (= {:kind "tables" :key ["PUBLIC" "orders"]} (:next (first responses)))))
        (testing "the answer that ends the tables has no cursor, since no later kind has anything"
          (is (nil? (:next (last responses)))))
        (testing "only the first answer has the database values"
          (is (= 1 (count (filter #{"database"} (mapcat types responses))))))))))

(deftest links-in-pages-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (let [tables (add-tables! db-id [["PUBLIC" "a" ["id" "b_id"]]
                                     ["PUBLIC" "b" ["id" "c_id"]]
                                     ["PUBLIC" "c" ["id"]]])]
      (t2/update! :model/Field :id (field-id (tables "a") "b_id") {:fk_target_field_id (field-id (tables "b") "id")})
      (t2/update! :model/Field :id (field-id (tables "b") "c_id") {:fk_target_field_id (field-id (tables "c") "id")})
      (with-redefs [pages/link-limit 1]
        (let [responses (answers db-name)]
          (testing "only the Tables that have links are sent as links, one page per limit"
            (is (= [["PUBLIC" "a"] ["PUBLIC" "b"]] (batch-keys "links" responses)))
            (is (= [["database" "tables"] ["links"] ["links"]] (mapv types responses)))))))))

(deftest stats-in-pages-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (let [tables (add-tables! db-id [["PUBLIC" "a" ["x" "y"]] ["PUBLIC" "b" ["x"]] ["PUBLIC" "c" ["x"]]])]
      (doseq [[table-name field-name] [["a" "x"] ["a" "y"] ["b" "x"]]]
        (t2/update! :model/Field :id (field-id (tables table-name) field-name) {:has_field_values :list})
        (t2/insert! :model/FieldValues {:field_id (field-id (tables table-name) field-name) :type :full
                                        :values   (vec (map str (range 20)))}))
      (t2/update! :model/Table :id (tables "c") {:estimated_row_count 9})
      (testing "a Table weighs its FieldValues rows, and one with only a row count weighs one"
        (with-redefs [pages/stats-field-values-limit 2]
          (is (= [[["PUBLIC" "a"]] [["PUBLIC" "b"] ["PUBLIC" "c"]]]
                 (mapv #(batch-keys "stats" [%]) (filter (comp #{["stats"]} types) (answers db-name)))))))
      (testing "the stats are also cut by size; a Table is never split, so a page always moves on"
        (with-redefs [pages/stats-byte-limit 10]
          (is (= [[["PUBLIC" "a"]] [["PUBLIC" "b"]] [["PUBLIC" "c"]]]
                 (mapv #(batch-keys "stats" [%]) (filter (comp #{["stats"]} types) (answers db-name))))))))))

(deftest kinds-with-nothing-are-skipped-test
  (testing "a Database with no Tables gets one answer, with only its values"
    (mt/with-temp [:model/Database {db-name :name} {:initial_sync_status "complete"}]
      (is (= [["database"]] (mapv types (answers db-name))))))
  (testing "a Database with no links and no stats gets no empty batch"
    (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
      (add-tables! db-id some-tables)
      (is (= [["database" "tables"]] (mapv types (answers db-name)))))))

(deftest link-out-of-the-selection-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (let [tables (add-tables! db-id [["PUBLIC" "orders" ["user_id"]] ["SALES" "people" ["id"]]])]
      (t2/update! :model/Field :id (field-id (tables "orders") "user_id")
                  {:fk_target_field_id (field-id (tables "people") "id")})
      (testing (str "a Table whose only FK points out of the selection is not sent as links; the sender only knows "
                    "that when it builds the links, so one answer has no batch")
        (is (= [["database" "tables"] []]
               (mapv types (answers db-name {:schema_filters {:type "inclusion" :patterns "PUBLIC"}}))))))))

(deftest what-is-never-sent-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (add-tables! db-id (conj some-tables ["mb__isolation_abc" "PUBLIC__orders" ["id"]]))
    (t2/update! :model/Table :db_id db-id :name "loose" {:active false})
    (testing "an inactive Table and a Table in a workspace's scratch schema are not sent"
      (is (= [["PUBLIC" "orders"] ["PUBLIC" "people"] ["SALES" "leads"]]
             (batch-keys "tables" (answers db-name)))))
    (testing "a schema filter limits the Tables"
      (is (= [["SALES" "leads"]]
             (batch-keys "tables" (answers db-name {:schema_filters {:type "inclusion" :patterns "SALES"}})))))))

(defn- error-data [database-name more]
  (try
    (send/changes-response (merge {:database database-name :engine "h2"} more))
    nil
    (catch ExceptionInfo e
      (select-keys (ex-data e) [:status-code :error-code]))))

(deftest database-errors-test
  (testing "a name that no Database has"
    (is (= {:status-code 404 :error-code "metadata-sync-database-not-found"} (error-data (mt/random-name) {}))))
  (testing "a stub Database does not count"
    (mt/with-temp [:model/Database {stub-name :name} {:is_stub true :initial_sync_status "complete"}]
      (is (= {:status-code 404 :error-code "metadata-sync-database-not-found"} (error-data stub-name {})))))
  (testing "the audit Database does not count"
    (mt/with-temp [:model/Database {audit-name :name} {:is_audit true :initial_sync_status "complete"}]
      (is (= {:status-code 404 :error-code "metadata-sync-database-not-found"} (error-data audit-name {})))))
  (testing "a Database with the name and another engine does not count"
    (mt/with-temp [:model/Database {database-name :name} {:initial_sync_status "complete"}]
      (is (= {:status-code 404 :error-code "metadata-sync-database-not-found"}
             (error-data database-name {:engine "postgres"})))))
  (testing "several Databases with the name and engine"
    (let [database-name (mt/random-name)]
      (mt/with-temp [:model/Database _ {:name database-name :initial_sync_status "complete"}
                     :model/Database _ {:name database-name :initial_sync_status "complete"}]
        (is (= {:status-code 409 :error-code "metadata-sync-database-ambiguous"} (error-data database-name {}))))))
  (testing "a Database whose first sync is not complete"
    (doseq [status ["incomplete" "aborted"]]
      (mt/with-temp [:model/Database {database-name :name} {:initial_sync_status status}]
        (is (= {:status-code 422 :error-code "metadata-sync-database-not-ready"} (error-data database-name {})))))))

(deftest database-name-matches-exactly-test
  (mt/with-temp [:model/Database database {:name "Bird Sightings" :initial_sync_status "complete"}]
    (testing "a Database whose name differs in case is not the one asked for, also when the app DB's collation says so"
      (mt/with-dynamic-fn-redefs [sync.db/databases-named (fn [_database-name] [database])]
        (is (= {:status-code 404 :error-code "metadata-sync-database-not-found"} (error-data "bird sightings" {})))
        (is (nil? (error-data "Bird Sightings" {})))))))

(deftest defective-duplicates-are-not-sent-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (let [{twin "orders_twin"} (add-tables! db-id [["PUBLIC" "orders" ["id"]] ["PUBLIC" "orders_twin" ["id"]]])]
      ;; a legacy duplicate has the key of another Table; H2's unique index refuses that, so only the flag is set here
      (t2/query-one {:update :metabase_table :set {:is_defective_duplicate true} :where [:= :id twin]})
      (testing "a Table marked as a defective duplicate is not sent, so a key is sent once"
        (is (= [["PUBLIC" "orders"]] (batch-keys "tables" (answers db-name))))))))

(deftest stats-cut-by-size-after-several-tables-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (let [tables (add-tables! db-id [["PUBLIC" "a" []] ["PUBLIC" "b" []] ["PUBLIC" "c" []] ["PUBLIC" "d" []]])]
      (doseq [[table-name row-count] [["a" 1] ["b" 2] ["c" 3] ["d" 4]]]
        (t2/update! :model/Table :id (tables table-name) {:estimated_row_count row-count}))
      (let [size  (count (json/encode {:schema "PUBLIC" :name "a" :estimated_row_count 1 :field_values []}))
            reads (atom [])
            query (mt/original-fn #'sync.db/full-field-values-of-tables)]
        (mt/with-dynamic-fn-redefs [sync.db/full-field-values-of-tables (fn [table-ids]
                                                                          (swap! reads into table-ids)
                                                                          (query table-ids))]
          (with-redefs [pages/stats-byte-limit (* 2 size)
                        pages/stats-read-tables 1]
            (let [stats-answers (filter (comp #{["stats"]} types) (answers db-name))]
              (testing "a cut after two Tables goes on after the last Table it kept"
                (is (= [[["PUBLIC" "a"] ["PUBLIC" "b"]] [["PUBLIC" "c"] ["PUBLIC" "d"]]]
                       (mapv #(batch-keys "stats" [%]) stats-answers))))
              (testing (str "a page stops reading once the stats pass the limit: read one Table at a time, only the "
                            "Table that did not fit is read again, by the next page")
                (is (= {(tables "a") 1 (tables "b") 1 (tables "c") 2 (tables "d") 1} (frequencies @reads)))))))))))

(deftest answer-names-its-database-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:initial_sync_status "complete"}]
    (add-tables! db-id some-tables)
    (with-redefs [pages/table-field-limit 1]
      (testing "every answer names the Database of its request, by name and engine"
        (is (= #{[db-name "h2"]} (set (map (juxt :database :engine) (answers db-name)))))))))

(deftest bad-schema-filter-test
  (mt/with-temp [:model/Database {db-name :name} {:initial_sync_status "complete"}]
    (testing "a schema filter that is not a pattern is refused, and is not a server error"
      (is (= {:status-code 400 :error-code "metadata-sync-bad-schema-filter"}
             (error-data db-name {:schema_filters {:type "inclusion" :patterns "["}}))))))

(deftest format-versions-of-the-request-test
  (mt/with-temp [:model/Database {db-name :name} {:initial_sync_status "complete"}]
    (testing "a request that names the format versions its receiver reads gets an answer in one of them"
      (is (= wire/format-version (:format_version (answer db-name {:format_versions [wire/format-version 99]})))))
    (testing "a request that names none is from a receiver of the first version, which reads the first version"
      (is (= 1 (:format_version (answer db-name)))))
    (testing "a request whose receiver reads no version this sender writes is refused, with the versions named"
      (is (= {:status-code 400 :error-code "metadata-sync-format-version-not-read"}
             (error-data db-name {:format_versions [99]}))))))

(deftest a-cursor-the-sender-does-not-know-is-refused-test
  (mt/with-temp [:model/Database {db-name :name} {:initial_sync_status "complete"}]
    (testing "a cursor of a kind this sender does not page, as a newer sender wrote it, is refused, not a server error"
      (is (= {:status-code 400 :error-code "metadata-sync-bad-cursor"}
             (error-data db-name {:after {:kind "remaps" :key nil}}))))))
