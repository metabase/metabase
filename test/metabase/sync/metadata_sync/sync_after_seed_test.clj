(ns metabase.sync.metadata-sync.sync-after-seed-test
  "A seeded Database's own sync, on a real warehouse: the seed is only worth it if that sync finds the metadata
  already there."
  (:require
   [clojure.test :refer :all]
   [metabase.sync.core :as sync]
   [metabase.sync.metadata-sync.receive :as receive]
   [metabase.sync.metadata-sync.send :as send]
   [metabase.test :as mt]
   [metabase.util.json :as json]
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
    (let [request  (receive/request! receiver-id after)
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
                                      :last_analyzed :fk_target_field_id])]))
          (t2/select :model/Field :table_id [:in (keys tables)] :active true))))

(defn- table-state
  "The active Tables of the Database with `db-id`, by name, with the columns that a sync of the Tables updates, except
  two. `estimated_row_count` follows the data, and a sync updates it whenever the warehouse's estimate moves: on
  Postgres the test data's Tables are synced before the warehouse has statistics for them, so the sender has no row
  counts, and the receiver's sync then sets them. `is_writable` depends on the login, so a seed does not copy it."
  [db-id]
  (into {}
        (map (juxt :name #(select-keys % [:description :database_require_filter :visibility_type
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

(deftest sync-after-a-seed-finds-the-metadata-there-test
  (mt/test-drivers #{:h2 :postgres :mysql}
    (let [sender (mt/db)]
      (mt/with-temp [:model/Database {receiver-id :id} {:engine              (:engine sender)
                                                        :details             (:details sender)
                                                        :initial_sync_status "incomplete"}]
        (seed! (:name sender) receiver-id)
        (let [seeded        (field-state receiver-id)
              seeded-tables (table-state receiver-id)]
          (testing "the seed copied every active Table and Field, with their fingerprints and FKs"
            (is (= (update-vals (field-state (:id sender)) #(dissoc % :fk_target_field_id))
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
            (is (= {} (differences seeded (field-state receiver-id))))))))))
