(ns metabase.warehouse-schema.models.writes-test
  "Statement counts of the bulk write functions of the warehouse-schema models, which must not grow with the number
  of rows."
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.dimension :as dimension]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- call-count!
  "The number of app-DB calls `thunk` makes."
  [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(defn- field-rows
  "Rows of `n` new Fields of the Table with `table-id`."
  [table-id n]
  (vec (for [i (range n)]
         {:table_id table-id :name (str "F" i) :base_type :type/Integer :database_type "INTEGER"})))

(defn- field-write-counts!
  "The calls creating `n` Fields of a new Table, renaming and deactivating them, and deleting them take."
  [n]
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    {table-id :id} {:db_id db-id}]
    (let [ids (volatile! nil)]
      [(call-count! #(vreset! ids (field/create-fields! (field-rows table-id n))))
       (call-count! #(field/update-fields! (mapv (fn [id] {:id id :display_name "Same"}) @ids)))
       (call-count! #(field/update-fields! (mapv (fn [id] {:id id :active false}) @ids)))
       (call-count! #(field/delete-fields! @ids))])))

(deftest field-writes-call-count-test
  (testing "creating, updating and deleting Fields takes as many statements for 2 rows as for 6"
    (is (= (field-write-counts! 2)
           (field-write-counts! 6)))))

(defn- table-write-counts!
  "The calls creating `n` Tables with a Field each, changing their field order, and deleting them take."
  [n]
  (mt/with-temp [:model/Database {db-id :id} {}]
    (let [tables (volatile! nil)]
      [(call-count! #(vreset! tables (table/create-tables! (vec (for [i (range n)] {:db_id db-id :name (str "T" i) :active true})))))
       (do (run! #(field/create-fields! (field-rows (:id %) 1)) @tables)
           (call-count! #(table/update-tables! (mapv (fn [{:keys [id]}] {:id id :field_order :alphabetical}) @tables))))
       (call-count! #(table/delete-tables! (mapv :id @tables)))])))

(deftest table-writes-call-count-test
  (testing "creating, reordering and deleting Tables takes as many statements for 2 rows as for 6"
    (is (= (table-write-counts! 2)
           (table-write-counts! 6)))))

(defn- dimension-write-counts!
  "The calls creating `n` external Dimensions and updating them take."
  [n]
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table    {table-id :id} {:db_id db-id}]
    (let [field-ids  (field/create-fields! (field-rows table-id (inc n)))
          target-id  (last field-ids)
          dimensions (volatile! nil)]
      [(call-count! #(vreset! dimensions (dimension/create-dimensions!
                                          (mapv (fn [id] {:field_id id :type :external :name "D"
                                                          :human_readable_field_id target-id})
                                                (butlast field-ids)))))
       (call-count! #(dimension/update-dimensions! (mapv (fn [{:keys [id]}] {:id id :name "E"}) @dimensions)))])))

(deftest dimension-writes-call-count-test
  (testing "creating and updating Dimensions takes as many statements for 2 rows as for 6"
    (is (= (dimension-write-counts! 2)
           (dimension-write-counts! 6)))))

(defn- settings-write-counts!
  "The calls creating settings for `n` Fields and their Tables, and updating them, take."
  [n]
  (mt/with-temp [:model/Database {db-id :id} {}]
    (let [tables          (table/create-tables! (vec (for [i (range n)] {:db_id db-id :name (str "T" i) :active true})))
          field-ids       (mapcat #(field/create-fields! (field-rows (:id %) 1)) tables)
          field-settings  (volatile! nil)
          table-settings  (volatile! nil)]
      [(call-count! #(vreset! field-settings (field-user-settings/create-field-user-settings!
                                              (mapv (fn [id] {:field_id id :description "d"}) field-ids))))
       (call-count! #(field-user-settings/update-field-user-settings-rows!
                      (mapv (fn [{:keys [id]}] {:id id :description "e"}) @field-settings)))
       (call-count! #(vreset! table-settings (table-user-settings/create-table-user-settings!
                                              (mapv (fn [{:keys [id]}] {:table_id id :visibility_type :hidden}) tables))))
       (call-count! #(table-user-settings/update-table-user-settings-rows!
                      (mapv (fn [{:keys [id]}] {:id id :visibility_type nil}) @table-settings)))])))

(deftest settings-writes-call-count-test
  (testing "creating and updating Field and Table settings takes as many statements for 2 rows as for 6"
    (is (= (settings-write-counts! 2)
           (settings-write-counts! 6)))))

(deftest field-deactivation-clears-pointers-test
  (testing "deactivating Fields clears the foreign keys to them and the remappings that read them"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (let [[target-id source-id remapped-id] (field/create-fields! (field-rows table-id 3))]
        (field/update-fields! [{:id source-id :semantic_type :type/FK :fk_target_field_id target-id}])
        (dimension/create-dimensions! [{:field_id remapped-id :type :external :name "D"
                                        :human_readable_field_id target-id}])
        (field/update-fields! [{:id target-id :active false}])
        (is (=? {:semantic_type nil :fk_target_field_id nil} (t2/select-one :model/Field :id source-id)))
        (is (nil? (t2/select-one :model/Dimension :field_id remapped-id)))))))

(deftest delete-fields-deletes-nested-fields-test
  (testing "deleting a Field deletes the Fields nested under it"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (let [[parent-id] (field/create-fields! (field-rows table-id 1))
            [child-id]  (field/create-fields! [(assoc (first (field-rows table-id 1)) :name "C" :parent_id parent-id)])
            [leaf-id]   (field/create-fields! [(assoc (first (field-rows table-id 1)) :name "L" :parent_id child-id)])]
        (field/delete-fields! [parent-id])
        (is (empty? (t2/select :model/Field :id [:in [parent-id child-id leaf-id]])))))))

(defn- same-value-write-counts!
  "The calls updating `n` Tables and their Fields to the same values, changing the case of their names, and setting
  the Fields' positions take."
  [n]
  (mt/with-temp [:model/Database {db-id :id} {}]
    (let [tables    (table/create-tables! (vec (for [i (range n)] {:db_id db-id :name (str "T" i) :active true})))
          field-ids (into [] (mapcat #(field/create-fields! (field-rows (:id %) 1))) tables)]
      (try
        [(call-count! #(table/update-tables! (mapv (fn [{:keys [id]}] {:id id :schema "S"}) tables)))
         (call-count! #(table/change-case! (mapv :id tables) :lower [:name]))
         (call-count! #(field/update-fields! (mapv (fn [id] {:id id :database_indexed true}) field-ids)))
         (call-count! #(field/change-case! field-ids :upper [:name]))
         (call-count! #(field/set-positions! (zipmap field-ids (range))))]
        (finally
          (table/delete-tables! (mapv :id tables)))))))

(deftest same-value-writes-call-count-test
  (testing "updating Tables and Fields to same values, changing case and setting positions takes as many statements for 2 rows as for 6"
    (is (= (same-value-write-counts! 2)
           (same-value-write-counts! 6)))))

(def ^:private published (atom []))

(doseq [topic [:event/table-update :event/field-update :event/field-delete]]
  (events/derive! topic ::published))

(methodical/defmethod events/publish-event! ::published
  [topic event]
  (swap! published conj [topic event]))

(deftest bulk-writes-publish-one-event-per-topic-test
  (testing "a bulk write publishes one event per topic, with a change for each row it changes"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (let [ids (field/create-fields! (field-rows table-id 3))]
        (reset! published [])
        (field/update-fields! (mapv (fn [id] {:id id :description "D"}) ids))
        (is (=? [[:event/field-update {:changes [{:object {:description "D"} :previous-object {:description nil}}
                                                 {:object {:description "D"}}
                                                 {:object {:description "D"}}]}]]
                @published))
        (testing "an update that changes nothing publishes no change"
          (reset! published [])
          (field/update-fields! (mapv (fn [id] {:id id :description "D"}) ids))
          (is (empty? @published)))
        (testing "the deactivation of a Table publishes one event"
          (reset! published [])
          (table/update-tables! [{:id table-id :active false}])
          (is (=? [[:event/table-update {:changes [{:object {:active false :deactivated_at some?}
                                                    :previous-object {:active true}}]}]]
                  @published)))
        (testing "deleting the Fields publishes one delete event"
          (reset! published [])
          (field/delete-fields! ids)
          (is (= [:event/field-delete] (map first @published)))
          (is (= (set ids) (set (map (comp :id :previous-object) (:changes (second (first @published))))))))))))
