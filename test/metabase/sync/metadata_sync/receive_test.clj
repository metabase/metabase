(ns metabase.sync.metadata-sync.receive-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.util :as driver.u]
   [metabase.search.core :as search]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.receive :as receive]
   [metabase.sync.metadata-sync.send :as send]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- add-tables!
  "Add Tables, each `[schema name field-names]`, to the Database with `db-id`, and return their ids by name."
  [db-id tables]
  (into {}
        (for [[table-schema table-name field-names] tables]
          (let [table-id (t2/insert-returning-pk! :model/Table {:db_id db-id :schema table-schema :name table-name
                                                                :active true :initial_sync_status "complete"})]
            (doseq [[i field-name] (map-indexed vector field-names)]
              (t2/insert! :model/Field {:table_id table-id :name field-name :base_type :type/Text
                                        :database_type "TEXT" :position i :database_position i}))
            [table-name table-id]))))

(def ^:private some-tables
  [["PUBLIC" "orders" ["id" "total" "user_id"]]
   ["PUBLIC" "people" ["id" "name"]]
   ["SALES" "leads" ["id" "email"]]])

(defn- field-id [table-id field-name]
  (t2/select-one-pk :model/Field :table_id table-id :name field-name))

(defn- through-json [x]
  (json/decode+kw (json/encode x)))

(defn- sender-answer
  "The answer of the sender's Database named `sender-name` to `request`, through JSON both ways, as the app carries it."
  [sender-name request]
  (through-json (send/changes-response (through-json (assoc request :database sender-name)))))

(defn- seed!
  "Seed the receiver's Database `receiver-id` from the sender's Database named `sender-name` as the app does: request,
  answer, apply, while there is a next cursor. Returns the number of rounds and the summed counts."
  [sender-name receiver-id]
  (loop [rounds 1 after nil counts {}]
    (let [request              (receive/request receiver-id after)
          {:keys [next] :as r} (receive/apply-response! receiver-id (sender-answer sender-name request))
          counts               (merge-with + counts (:counts r))]
      (cond
        (nil? next)   {:rounds rounds :counts counts}
        (> rounds 50) (throw (ex-info "the seed does not end" {:rounds rounds}))
        :else         (recur (inc rounds) next counts)))))

(defn- metadata
  "The metadata of the Database with `db-id` that a seed copies, by name, so two Databases can be compared."
  [db-id]
  (let [tables (t2/select :model/Table :db_id db-id :active true)
        names  (into {} (map (juxt :id (juxt :schema :name))) tables)
        fields (when (seq tables) (t2/select :model/Field :table_id [:in (keys names)] :active true))
        by-id  (into {} (map (juxt :id identity)) fields)]
    (into {}
          (for [{table-id :id :as table} tables]
            [(names table-id)
             {:description         (:description table)
              :estimated_row_count (:estimated_row_count table)
              :fields              (into {}
                                         (for [field fields
                                               :when (= table-id (:table_id field))
                                               :let  [target (by-id (:fk_target_field_id field))]]
                                           [(:name field)
                                            {:base_type     (:base_type field)
                                             :database_type (:database_type field)
                                             :semantic_type (:semantic_type field)
                                             :fingerprint   (:fingerprint field)
                                             :fk_target     (when target [(names (:table_id target)) (:name target)])
                                             :field_values  (t2/select-one-fn :values :model/FieldValues
                                                                              :field_id (:id field) :type :full)}]))}]))))

(defn- do-with-sender-and-receiver!
  "Call `f` with the ids by name of the sender's Tables, the sender's Database name, and the receiver's Database id.
  The sender has [[some-tables]], an FK from orders.user_id to people.id, a description, a fingerprint, a row count
  and field values on orders."
  [f]
  (mt/with-temp [:model/Database {sender :id sender-name :name} {:initial_sync_status "complete"
                                                                 :timezone            "UTC"
                                                                 :dbms_version        {:flavor "H2"}}
                 :model/Database {receiver-id :id}              {:initial_sync_status "incomplete"}]
    (let [tables (add-tables! sender some-tables)]
      (t2/update! :model/Field :id (field-id (tables "orders") "user_id")
                  {:fk_target_field_id (field-id (tables "people") "id") :semantic_type :type/FK})
      (t2/update! :model/Field :id (field-id (tables "orders") "total")
                  {:fingerprint {:global {:distinct-count 2}} :fingerprint_version 5})
      (t2/update! :model/Table :id (tables "orders") {:estimated_row_count 3 :description "All orders"})
      (t2/insert! :model/FieldValues {:field_id (field-id (tables "orders") "total") :type :full
                                      :values   ["1" "2"]})
      (f tables sender-name receiver-id sender))))

;;; ------------------------------------------------ Request ------------------------------------------------

(deftest request-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine  :h2}
                 :model/Database {pg-id :id}               {:engine  :postgres
                                                            :details {:schema-filters-type     "inclusion"
                                                                      :schema-filters-patterns "PUBLIC"}}]
    (testing "a request names the Database by name and engine"
      (is (= {:database db-name :engine "h2"} (receive/request db-id nil))))
    (testing "with its schema filters, when its driver has them"
      (is (=? {:engine "postgres" :schema_filters {:type "inclusion" :patterns "PUBLIC"}}
              (receive/request pg-id nil))))
    (testing "it carries the cursor it is given"
      (is (= {:kind "links" :key ["PUBLIC" "orders"]}
             (:after (receive/request db-id {:kind "links" :key ["PUBLIC" "orders"]})))))))

;;; ------------------------------------------------ Seed ------------------------------------------------

(deftest seed-copies-the-metadata-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id sender]
     (let [{:keys [counts]} (seed! sender-name receiver-id)]
       (testing "the receiver has the sender's Tables, Fields, FK, fingerprints, row count and field values"
         (is (= (metadata sender) (metadata receiver-id))))
       (testing "and the database values"
         (is (=? {:timezone "UTC" :dbms_version {:flavor "H2"}} (t2/select-one :model/Database :id receiver-id))))
       (testing "the counts say what it wrote"
         (is (= {:database_updated      1
                 :tables_inserted       3
                 :tables_existing       0
                 :fields_inserted       7
                 :fks_set               1
                 :row_counts_set        1
                 :field_values_inserted 1}
                counts)))
       (testing "the Database and its Tables count as synced"
         (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Database :id receiver-id)))
         (is (= #{"complete"} (set (t2/select-fn-set :initial_sync_status :model/Table :db_id receiver-id)))))))))

(deftest seed-in-many-rounds-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id sender]
     (with-redefs [pages/table-field-limit       1
                   pages/link-limit               1
                   pages/stats-field-values-limit 1]
       (let [{:keys [rounds]} (seed! sender-name receiver-id)]
         (testing "small limits make one round per Table, and the result is the same"
           (is (= 5 rounds))
           (is (= (metadata sender) (metadata receiver-id)))))))))

(deftest synced-only-after-the-last-answer-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [first-answer (sender-answer sender-name (receive/request receiver-id nil))]
       (is (some? (:next first-answer)))
       (receive/apply-response! receiver-id first-answer)
       (testing "an answer with a next cursor leaves the Database's first sync incomplete"
         (is (= "incomplete" (t2/select-one-fn :initial_sync_status :model/Database :id receiver-id))))))))

(deftest a-second-seed-changes-nothing-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (seed! sender-name receiver-id)
     (let [before (metadata receiver-id)
           {:keys [counts]} (seed! sender-name receiver-id)]
       (testing "a second seed only finds the Tables it has"
         (is (= {:database_updated 0 :tables_inserted 0 :tables_existing 3 :fields_inserted 0 :fks_set 0
                 :row_counts_set 0 :field_values_inserted 0}
                counts))
         (is (= before (metadata receiver-id))))))))

(deftest existing-rows-are-left-alone-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [mine (add-tables! receiver-id [["PUBLIC" "orders" ["total" "local_column"]]
                                          ["PUBLIC" "people" ["id"]]
                                          ["SALES" "leads" ["id"]]])]
       (t2/update! :model/Table :id (mine "orders") {:description "Mine" :estimated_row_count 99})
       (t2/update! :model/Table :id (mine "leads") {:active false})
       (t2/insert! :model/FieldValues {:field_id (field-id (mine "orders") "total") :type :full :values ["mine"]})
       (let [{:keys [counts]} (seed! sender-name receiver-id)]
         (testing "a Table the receiver has, active or not, is not written: not its columns, Fields or stats"
           (is (=? {:tables_inserted 0 :tables_existing 3 :fields_inserted 0 :row_counts_set 0
                    :field_values_inserted 0}
                   counts))
           (is (=? {:description "Mine" :estimated_row_count 99} (t2/select-one :model/Table :id (mine "orders"))))
           (is (= #{"total" "local_column"} (t2/select-fn-set :name :model/Field :table_id (mine "orders"))))
           (is (= ["mine"] (t2/select-one-fn :values :model/FieldValues :field_id (field-id (mine "orders") "total"))))
           (is (false? (t2/select-one-fn :active :model/Table :id (mine "leads"))))))))))

(deftest empty-values-are-filled-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [mine             (add-tables! receiver-id [["PUBLIC" "orders" ["id" "total" "user_id"]]
                                                      ["PUBLIC" "people" ["id" "name"]]])
           {:keys [counts]} (seed! sender-name receiver-id)]
       (testing "an existing Table with no row count, FK or field values gets the sender's"
         (is (=? {:tables_inserted 1 :tables_existing 2 :fks_set 1 :row_counts_set 1 :field_values_inserted 1}
                 counts))
         (is (= 3 (t2/select-one-fn :estimated_row_count :model/Table :id (mine "orders"))))
         (is (= (field-id (mine "people") "id")
                (t2/select-one-fn :fk_target_field_id :model/Field :id (field-id (mine "orders") "user_id")))))))))

(deftest a-set-fk-is-not-overwritten-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [mine (add-tables! receiver-id [["PUBLIC" "orders" ["user_id"]] ["PUBLIC" "people" ["id" "name"]]])]
       (t2/update! :model/Field :id (field-id (mine "orders") "user_id")
                   {:fk_target_field_id (field-id (mine "people") "name")})
       (is (=? {:fks_set 0} (:counts (seed! sender-name receiver-id))))
       (is (= (field-id (mine "people") "name")
              (t2/select-one-fn :fk_target_field_id :model/Field :id (field-id (mine "orders") "user_id"))))))))

(deftest a-link-to-a-missing-field-is-skipped-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (add-tables! receiver-id [["PUBLIC" "orders" ["user_id"]] ["PUBLIC" "people" ["name"]]])
     (testing "an FK whose target the receiver does not have is skipped, and the seed goes on"
       (is (=? {:fks_set 0 :tables_inserted 1} (:counts (seed! sender-name receiver-id))))))))

(deftest a-field-matches-case-insensitively-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [mine (add-tables! receiver-id [["PUBLIC" "orders" ["USER_ID"]] ["PUBLIC" "people" ["ID"]]])]
       (is (=? {:fks_set 1} (:counts (seed! sender-name receiver-id))))
       (is (= (field-id (mine "people") "ID")
              (t2/select-one-fn :fk_target_field_id :model/Field :id (field-id (mine "orders") "USER_ID"))))))))

(deftest database-values-are-filled-only-when-empty-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (t2/update! :model/Database :id receiver-id {:timezone "Europe/Paris"})
     (seed! sender-name receiver-id)
     (is (=? {:timezone "Europe/Paris" :dbms_version {:flavor "H2"}} (t2/select-one :model/Database :id receiver-id))))))

;;; ------------------------------------------------ Refusals ------------------------------------------------

(defn- refusal! [database-id response]
  (try
    (receive/apply-response! database-id response)
    nil
    (catch ExceptionInfo e
      (select-keys (ex-data e) [:status-code :error-code]))))

(deftest refusals-write-nothing-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [good (sender-answer sender-name (receive/request receiver-id nil))]
       (testing "another format version"
         (is (= {:status-code 422 :error-code "metadata-sync-format-version-differs"}
                (refusal! receiver-id (assoc good :format_version (inc wire/format-version))))))
       (testing "a batch type this version does not know, also after good batches"
         (is (= {:status-code 422 :error-code "metadata-sync-unknown-batch-type"}
                (refusal! receiver-id (update good :batches conj {:type "remaps" :tables []})))))
       (testing "a malformed answer"
         (is (= {:status-code 422 :error-code "metadata-sync-malformed-response"}
                (refusal! receiver-id (assoc-in good [:batches 1 :tables 0 :fields] "not a list"))))
         (is (= {:status-code 422 :error-code "metadata-sync-malformed-response"}
                (refusal! receiver-id (update good :batches conj {:tables []})))))
       (testing "nothing was written"
         (is (= {} (metadata receiver-id))))
       (testing "the message says nothing of the answer's values"
         (is (not (re-find #"orders" (try (receive/apply-response! receiver-id (assoc-in good [:batches 1 :tables 0
                                                                                               :fields] "orders"))
                                          ""
                                          (catch ExceptionInfo e (ex-message e)))))))))))

(deftest databases-that-cannot-receive-test
  (testing "no such Database"
    (is (= {:status-code 404 :error-code "metadata-sync-no-database"}
           (refusal! Integer/MAX_VALUE {:format_version wire/format-version :batches []}))))
  (testing "a stub Database and the audit Database"
    (doseq [values [{:is_stub true} {:is_audit true}]]
      (mt/with-temp [:model/Database {db-id :id} values]
        (is (= {:status-code 400 :error-code "metadata-sync-database-not-loadable"}
               (refusal! db-id {:format_version wire/format-version :batches []})))
        (is (thrown-with-msg? ExceptionInfo #"does not take" (receive/request db-id nil)))))))

(deftest a-failure-while-applying-writes-nothing-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [good (sender-answer sender-name (receive/request receiver-id nil))
           bad  (assoc-in good [:batches 1 :tables 0 :fields 0 :last_analyzed] "not a time")]
       (testing "a value that only the write rejects refuses the whole answer, with its own code"
         (is (= {:status-code 422 :error-code "metadata-sync-apply-failed"} (refusal! receiver-id bad))))
       (testing "and nothing of it is written: not the database values of its first batch, and no Table"
         (is (=? {:timezone nil :dbms_version nil} (t2/select-one :model/Database :id receiver-id)))
         (is (= {} (metadata receiver-id))))
       (testing "the message says nothing of the answer's values"
         (is (not (re-find #"not a time" (try (receive/apply-response! receiver-id bad)
                                              ""
                                              (catch ExceptionInfo e (ex-message e)))))))))))

(deftest other-field-values-are-left-alone-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [mine  (add-tables! receiver-id [["PUBLIC" "orders" ["id" "total" "user_id"]]])
           total (field-id (mine "orders") "total")]
       (t2/insert! :model/FieldValues {:field_id total :type :sandbox :hash_key "abc" :values ["mine"]})
       (testing "a Field with FieldValues of another type gets no :full row, so its other rows stay"
         (is (=? {:field_values_inserted 0} (:counts (seed! sender-name receiver-id))))
         (is (= [:sandbox] (t2/select-fn-vec :type :model/FieldValues :field_id total))))))))

(deftest one-key-twice-in-a-batch-test
  (mt/with-temp [:model/Database {receiver-id :id} {}]
    (let [doc      {:schema "PUBLIC" :name "twice" :fields [{:path ["id"] :base_type "type/Integer"
                                                             :database_type "INTEGER"}]}
          response {:format_version wire/format-version :batches [{:type "tables" :tables [doc doc]}]}]
      (testing "a key that an answer has twice inserts one Table"
        (is (=? {:counts {:tables_inserted 1}} (receive/apply-response! receiver-id response)))
        (is (= 1 (t2/count :model/Table :db_id receiver-id :name "twice")))))))

(deftest an-empty-schema-and-no-schema-are-one-key-test
  (mt/with-temp [:model/Database {receiver-id :id} {}
                 :model/Table    _                 {:db_id receiver-id :schema "" :name "loose"}]
    (testing "a Table with no schema is the receiver's Table with an empty schema, as the unique index says"
      (is (=? {:counts {:tables_inserted 0 :tables_existing 1}}
              (receive/apply-response! receiver-id {:format_version wire/format-version
                                                    :batches        [{:type   "tables"
                                                                      :tables [{:name "loose" :fields []}]}]}))))))

;;; ------------------------------------------------ Nested Fields ------------------------------------------------

(defn- field-paths
  "The name path of each active Field of the Database with `db-id`, by its Table's name, with its base type."
  [db-id]
  (let [tables (t2/select-pk->fn :name :model/Table :db_id db-id :active true)
        fields (when (seq tables) (t2/select :model/Field :table_id [:in (keys tables)] :active true))
        by-id  (into {} (map (juxt :id identity)) fields)
        path   (fn path [{:keys [parent_id] field-name :name}]
                 (conj (if parent_id (path (by-id parent_id)) []) field-name))]
    (into #{} (map (fn [field] [(tables (:table_id field)) (path field) (:base_type field)])) fields)))

(deftest nested-fields-are-copied-under-their-parents-test
  (mt/with-temp [:model/Database {sender :id sender-name :name} {:initial_sync_status "complete"}
                 :model/Database {receiver-id :id}              {:initial_sync_status "incomplete"}
                 :model/Table    {table-id :id}                 {:db_id sender :schema "PUBLIC" :name "sightings"}
                 :model/Field    {place :id}                    {:table_id table-id :name "place"
                                                                 :base_type :type/Dictionary}
                 :model/Field    {coords :id}                   {:table_id table-id :name "coords"
                                                                 :base_type :type/Dictionary :parent_id place}
                 :model/Field    _                              {:table_id table-id :name "lat"
                                                                 :base_type :type/Float :parent_id coords}
                 :model/Field    _                              {:table_id table-id :name "name"
                                                                 :base_type :type/Text :parent_id place}
                 :model/Field    _                              {:table_id table-id :name "name"
                                                                 :base_type :type/Text}]
    (let [{:keys [counts]} (seed! sender-name receiver-id)]
      (testing "every nested Field is copied, under the parent of the same path"
        (is (= (field-paths sender) (field-paths receiver-id))))
      (testing "and counted"
        (is (= 5 (:fields_inserted counts)))))))

(deftest broken-field-paths-are-refused-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [field  (fn [& path] {:path (vec path) :base_type "type/Text" :database_type "TEXT"})
          answer (fn [& fields]
                   {:format_version wire/format-version
                    :batches        [{:type "tables" :tables [{:schema "PUBLIC" :name "sightings"
                                                               :fields (vec fields)}]}]})]
      (testing "a nested Field whose parent is not in its Table's entry"
        (is (= {:status-code 422 :error-code "metadata-sync-malformed-response"}
               (refusal! receiver-id (answer (field "place") (field "coords" "lat"))))))
      (testing "a path that is in an entry twice"
        (is (= {:status-code 422 :error-code "metadata-sync-malformed-response"}
               (refusal! receiver-id (answer (field "place") (field "place"))))))
      (testing "nothing was written"
        (is (= {} (metadata receiver-id))))
      (testing "a parent after its child is fine"
        (is (=? {:counts {:fields_inserted 2}}
                (receive/apply-response! receiver-id (answer (field "place" "lat") (field "place")))))))))

;;; ------------------------------------------- What the model would do -------------------------------------------

(def ^:private instance-columns
  "The columns that differ between two rows for the same warehouse table or column in two Databases."
  [:id :db_id :table_id :parent_id :created_at :updated_at :entity_id :fk_target_field_id])

(defn- one-table-answer []
  {:format_version wire/format-version
   :batches        [{:type   "tables"
                     :tables [{:schema "PUBLIC" :name "bird_sightings" :description "Every bird seen"
                               :fields [{:path ["id"] :base_type "type/Integer" :database_type "INT"
                                         :database_is_pk true :semantic_type "type/PK"}
                                        {:path ["species"] :base_type "type/Text" :database_type "TEXT"
                                         :fingerprint {:global {:distinct-count 3}} :fingerprint_version 5
                                         :last_analyzed "2026-01-01T00:00:00Z" :has_field_values "list"}
                                        {:path ["seen_at"] :base_type "type/Text" :database_type "TEXT"
                                         :coercion_strategy "Coercion/ISO8601->DateTime"
                                         :effective_type "type/DateTime"}
                                        {:path ["wings"] :base_type "type/Text" :database_type "TEXT"
                                         :effective_type "type/Integer"}]}]}]})

(defn- through-the-model!
  "Insert, through the models, a copy of the Table with `table-id` and its Fields into the Database with `db-id`, from
  the values the seed wrote that a sync sets, and return the new Table's id."
  [db-id table-id]
  (let [table     (t2/select-one :model/Table :id table-id)
        new-id    (t2/insert-returning-pk! :model/Table (-> (apply dissoc table :data_layer :data_authority
                                                                   instance-columns)
                                                            (dissoc :display_name)
                                                            (assoc :db_id db-id)
                                                            u/remove-nils))]
    (doseq [field (t2/select :model/Field :table_id table-id)]
      (t2/insert! :model/Field (-> (apply dissoc field :display_name instance-columns)
                                   (assoc :table_id new-id)
                                   u/remove-nils)))
    new-id))

(defn- row-columns
  "The rows of the Table with `table-id` and its Fields, without the columns that belong to one Database."
  [table-id]
  {:table  (apply dissoc (t2/select-one :model/Table :id table-id) instance-columns)
   :fields (into {} (map (juxt :name #(apply dissoc % instance-columns)))
                 (t2/select :model/Field :table_id table-id))})

(deftest a-seeded-table-is-the-same-as-one-inserted-through-the-model-test
  (mt/with-temp [:model/Database         {receiver-id :id} {:initial_sync_status "incomplete"}
                 :model/Database         {other-id :id}    {}
                 :model/PermissionsGroup {group-id :id}    {}]
    ;; A group with no permission on a Database gets one row per new Table and permission type.
    (t2/delete! :model/DataPermissions :group_id group-id :db_id [:in [receiver-id other-id]])
    (receive/apply-response! receiver-id (one-table-answer))
    (let [seeded   (t2/select-one-pk :model/Table :db_id receiver-id)
          modelled (through-the-model! other-id seeded)]
      (testing "the Table and its Fields have the values a model insert gives them"
        (is (= (row-columns modelled) (row-columns seeded))))
      (testing "an effective type with no coercion is the base type, as the model makes it"
        (is (= :type/Text (t2/select-one-fn :effective_type :model/Field :table_id seeded :name "wings"))))
      (testing "the Table gets the permissions a model insert gives"
        (let [perms #(set (map (fn [p] (dissoc p :id :db_id :table_id))
                               (t2/select :model/DataPermissions :table_id %)))]
          (is (some #(= group-id (:group_id %)) (perms seeded)))
          (is (= (perms modelled) (perms seeded))))))))

(defn- change-log-entries
  "The change log entries written while `thunk` runs, as `[table-name action]` and their count."
  [thunk]
  (let [top (or (:id (t2/query-one ["SELECT MAX(id) AS id FROM change_log"])) 0)]
    (thunk)
    (frequencies (map (juxt :table_name :action)
                      (t2/query ["SELECT table_name, action FROM change_log WHERE id > ?" top])))))

(deftest a-seed-writes-the-change-log-test
  (mt/with-premium-features #{:change-log}
    (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
      (testing "each inserted Table and Field has an entry, as a model insert gives it"
        (is (=? {["metabase_table" "insert"] 1
                 ["metabase_field" "insert"] 4}
                (change-log-entries #(receive/apply-response! receiver-id (one-table-answer)))))))))

(deftest a-seed-queues-the-new-tables-for-the-search-index-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [queued (atom [])
          update (mt/original-fn #'search/bulk-update!)]
      (mt/with-dynamic-fn-redefs [search/bulk-update! (fn [instances]
                                                        (swap! queued into instances)
                                                        (update instances))]
        (receive/apply-response! receiver-id (one-table-answer)))
      (is (= [[:model/Table (t2/select-one-pk :model/Table :db_id receiver-id)]]
             (map (juxt t2/model :id) @queued))))))

;;; ------------------------------------------------ The lease ------------------------------------------------

(defn- sync-runs?
  "Whether a sync operation of the Database with `db-id` runs now, and not skipped."
  [db-id]
  (let [ran (atom false)]
    (sync-util/do-explicit-sync-operation :sync (driver.u/lib-database db-id) "test" #(reset! ran true))
    @ran))

(deftest no-sync-during-a-seed-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id sender]
     (testing "before a seed, a sync runs"
       (is (sync-runs? receiver-id)))
     (testing "from the first request, a sync of the receiving Database does not run"
       (receive/request receiver-id nil)
       (is (not (sync-runs? receiver-id))))
     (testing "a sync of another Database runs"
       (is (sync-runs? sender)))
     (testing "after the last answer, a sync runs again"
       (seed! sender-name receiver-id)
       (is (sync-runs? receiver-id))))))

(deftest a-seed-that-stops-lets-sync-run-again-test
  (do-with-sender-and-receiver!
   (fn [_tables _sender-name receiver-id _sender]
     (receive/request receiver-id nil)
     (is (not (sync-runs? receiver-id)))
     (testing "once the lease is older than its time, a sync runs"
       (swap! @#'receive/leases update receiver-id #(.minus ^java.time.Instant % @#'receive/lease-duration))
       (is (sync-runs? receiver-id))))))

(deftest no-seed-during-a-sync-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [good    (sender-answer sender-name (receive/request receiver-id nil))
           refused (fn [thunk]
                     (try (thunk) nil (catch ExceptionInfo e (select-keys (ex-data e) [:status-code :error-code]))))
           during  (fn [thunk]
                     ((sync-util/with-duplicate-ops-prevented :sync (driver.u/lib-database receiver-id)
                                                              #(refused thunk))))]
       (testing "while a sync of the Database runs, a request and an apply are refused"
         (is (= {:status-code 409 :error-code "metadata-sync-sync-running"}
                (during #(receive/request receiver-id nil))))
         (is (= {:status-code 409 :error-code "metadata-sync-sync-running"}
                (during #(receive/apply-response! receiver-id good)))))
       (testing "and nothing was written"
         (is (= {} (metadata receiver-id))))))))
