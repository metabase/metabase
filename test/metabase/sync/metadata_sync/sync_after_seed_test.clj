(ns ^:mb/driver-tests metabase.sync.metadata-sync.sync-after-seed-test
  "A seeded Database's own sync, on a real warehouse: the seed is only worth it if that sync finds the metadata
  already there."
  (:require
   [clojure.test :refer :all]
   [metabase.sync.core :as sync]
   [metabase.sync.metadata-sync.receive :as receive]
   [metabase.sync.metadata-sync.send :as send]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [metabase.warehouse-schema.user-settings :as user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- through-json [x]
  (json/decode+kw (json/encode x)))

(defn- seed!
  "Seed the Database `receiver-id` from the Database named `sender-name`, as the app does, through JSON both ways.
  Both are in one app DB here, where two Databases cannot have one name, so the request is sent with the sender's name
  and the answer gets the name of the request back."
  [sender-name receiver-id]
  (loop [after nil rounds 1]
    (let [request  (receive/request receiver-id after)
          response (-> (send/changes-response (through-json (assoc request :database sender-name)))
                       (assoc :database (:database request))
                       through-json)
          {:keys [next]} (receive/apply-response! receiver-id response)]
      (cond
        (nil? next)    nil
        (> rounds 100) (throw (ex-info "the seed does not end" {:rounds rounds}))
        :else          (recur next (inc rounds))))))

(defn- field-state
  "The active Fields of the Database with `db-id`, by `[table-name field-name]`, with what a sync could change."
  [db-id]
  (let [tables (t2/select-pk->fn :name :model/Table :db_id db-id :active true)]
    (into {}
          (map (fn [field]
                 [[(tables (:table_id field)) (:name field)]
                  (select-keys field [:base_type :database_type :semantic_type :fingerprint :fingerprint_version
                                      :last_analyzed :fk_target_field_id :visibility_type :has_field_values
                                      :preview_display])]))
          (t2/select :model/Field :table_id [:in (keys tables)] :active true))))

(defn- as-seeded
  "The `field-state` of a sender as a seed copies it: a sensitive Field without its analysis, which is not sent."
  [field-state]
  (update-vals field-state (fn [field]
                             (cond-> field
                               (= :sensitive (:visibility_type field))
                               (assoc :fingerprint nil :fingerprint_version 0 :last_analyzed nil)))))

(defn- table-state
  "The active Tables of the Database with `db-id`, by name, with the columns that a sync of the Tables updates, except
  two. `estimated_row_count` follows the data, and a sync updates it whenever the warehouse's estimate moves: on
  Postgres the test data's Tables are synced before the warehouse has statistics for them, so the sender has no row
  counts, and the receiver's sync then sets them. `is_writable` depends on the login, so a seed does not copy it."
  [db-id]
  (into {}
        (map (juxt :name #(select-keys % [:description :database_require_filter :data_layer
                                          :initial_sync_status])))
        (t2/select :model/Table :db_id db-id :active true)))

(defn- differences
  "The entries of the map `after` that differ from the map `before`, as `{k {:before .. :after ..}}`."
  [before after]
  (into {}
        (keep (fn [[k v]]
                (when (not= (before k) v)
                  [k {:before (before k) :after v}])))
        after))

(defn- fk-targets
  "The FK targets of the Database with `db-id`, by name, so they compare across Databases."
  [db-id]
  (let [tables (t2/select-pk->fn :name :model/Table :db_id db-id :active true)
        fields (t2/select :model/Field :table_id [:in (keys tables)] :active true)
        by-id  (into {} (map (juxt :id identity)) fields)]
    (into {}
          (keep (fn [{:keys [fk_target_field_id] :as field}]
                  (when-let [target (by-id fk_target_field_id)]
                    [[(tables (:table_id field)) (:name field)] [(tables (:table_id target)) (:name target)]])))
          fields)))

(defn- step-result
  "The result of the step named `step-name` of the part named `part-name` of the `results` of a Database sync."
  [results part-name step-name]
  (some (fn [{:keys [name steps]}]
          (when (= part-name name)
            (some (fn [[n result]] (when (= step-name n) result)) steps)))
        results))

(defn- do-with-synced-sender
  "Call `f` with a copy of the test data's Database that has run its own sync, renamed so that a sender serves it. Other
  tests change the metadata of the test data, and a Field they leave unanalyzed would be analyzed by the sender's own
  sync as much as by the receiver's."
  [f]
  (mt/with-temp-copy-of-db
    (t2/update! :model/Database :id (mt/id) {:name                (str "seed sender " (mt/random-name))
                                             :initial_sync_status "complete"})
    (sync/sync-database! (mt/id))
    (f (t2/select-one :model/Database :id (mt/id)))))

(deftest sync-after-a-seed-finds-the-metadata-there-test
  (mt/test-drivers #{:h2 :postgres :mysql}
    (do-with-synced-sender
     (fn [sender]
       (mt/with-temp [:model/Database {receiver-id :id} {:engine              (:engine sender)
                                                         :details             (:details sender)
                                                         :initial_sync_status "incomplete"}]
         (seed! (:name sender) receiver-id)
         (let [seeded        (field-state receiver-id)
               seeded-tables (table-state receiver-id)]
           (testing "the seed copied every active Table and Field, with their fingerprints and FKs"
             (is (= (update-vals (as-seeded (field-state (:id sender))) #(dissoc % :fk_target_field_id))
                    (update-vals seeded #(dissoc % :fk_target_field_id))))
             (is (= (fk-targets (:id sender)) (fk-targets receiver-id))))
           (testing "the seed did not copy whether the sender's login can write a Table: the receiver's sync reads it"
             (is (every? nil? (t2/select-fn-vec :is_writable :model/Table :db_id receiver-id))))
           (let [results (sync/sync-database! receiver-id)]
             (testing "the receiver's own sync runs, finds every Table, and updates and fingerprints nothing"
               (is (= {} (differences seeded-tables (table-state receiver-id))))
               (is (=? {:total-tables pos-int?} (step-result results "metadata" "sync-tables")))
               (is (=? {:updated-fields 0} (step-result results "metadata" "sync-fields")))
               (is (=? {:updated-fks 0} (step-result results "metadata" "sync-fks")))
               (is (=? {:fingerprints-attempted 0} (step-result results "analyze" "fingerprint-fields")))
               (is (=? {:fields-classified 0} (step-result results "analyze" "classify-fields")))))
           (testing "the receiver's own sync then adds, retires and analyzes nothing"
             (is (= (set (keys seeded)) (set (keys (field-state receiver-id)))))
             (is (= {} (differences seeded (field-state receiver-id)))))))))))

(defn- user-set-state
  "What a user set on the active Tables and Fields of the Database with `db-id`, by name: the columns each settings
  row says a user set, with their values on the row."
  [db-id]
  (let [tables      (t2/select :model/Table :db_id db-id :active true)
        table-names (u/index-by :id :name tables)
        fields      (t2/select :model/Field :table_id [:in (keys table-names)] :active true)
        field-names (u/index-by :id #(vector (table-names (:table_id %)) (:name %)) fields)
        tables-by-id (u/index-by :id tables)
        fields-by-id (u/index-by :id fields)]
    {:tables (into {}
                   (map (fn [settings]
                          [(table-names (:table_id settings))
                           (select-keys (tables-by-id (:table_id settings))
                                        (user-settings/user-set-table-columns settings))]))
                   (t2/select :model/TableUserSettings :table_id [:in (keys table-names)]))
     :fields (into {}
                   (map (fn [settings]
                          [(field-names (:field_id settings))
                           (select-keys (fields-by-id (:field_id settings))
                                        (disj (user-settings/user-set-field-columns settings) :fk_target_field_id))]))
                   (t2/select :model/FieldUserSettings :field_id [:in (keys field-names)]))}))

(defn- full-field-values
  "The `:full` field values of the active Fields of the Database with `db-id`, by `[table-name field-name]`."
  [db-id]
  (let [tables (t2/select-pk->fn :name :model/Table :db_id db-id :active true)
        fields (t2/select-pk->fn #(vector (tables (:table_id %)) (:name %)) :model/Field
                                 :table_id [:in (keys tables)] :active true)]
    (into {}
          (map (juxt (comp fields :field_id) :values))
          (t2/select :model/FieldValues :field_id [:in (keys fields)] :type :full))))

(deftest sync-after-a-seed-keeps-what-users-set-and-the-field-values-test
  (mt/test-drivers #{:h2 :postgres :mysql}
    (mt/with-temp-copy-of-db
      (let [sender-id   (mt/id)
            sender-name (str "seed sender " (mt/random-name))]
        ;; the copy has the name of the test data's Database, and a sender refuses a name that two Databases have
        (t2/update! :model/Database :id sender-id {:name sender-name :initial_sync_status "complete"})
        (table-user-settings/create-table-user-settings!
         [{:table_id (mt/id :venues) :entity_type :entity/EventTable}
          {:table_id (mt/id :users) :description "People who check in" :description_set true}])
        (field-user-settings/create-field-user-settings!
         [{:field_id (mt/id :venues :name) :visibility_type :details-only :display_name "Venue"}
          {:field_id (mt/id :venues :price) :semantic_type :type/Score :semantic_type_set true
           :description "How much" :description_set true}])
        (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :categories :name)))
        (let [sender (t2/select-one :model/Database :id sender-id)]
          (mt/with-temp [:model/Database {receiver-id :id} {:engine              (:engine sender)
                                                            :details             (:details sender)
                                                            :initial_sync_status "incomplete"}]
            (seed! sender-name receiver-id)
            (testing "the seed copies what users set on the sender, with and without a flag, and the field values"
              (is (= (user-set-state sender-id) (user-set-state receiver-id)))
              (is (seq (full-field-values receiver-id)))
              (is (= (full-field-values sender-id) (full-field-values receiver-id))))
            (sync/sync-database! receiver-id)
            (testing "the receiver's own sync then keeps them"
              (is (= (user-set-state sender-id) (user-set-state receiver-id)))
              (is (= (full-field-values sender-id) (full-field-values receiver-id))))))))))
