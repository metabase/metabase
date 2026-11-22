(ns metabase.warehouse-schema.models.write-function-statement-counts-test
  "The write functions of the warehouse-schema models run a number of statements that does not grow with the rows of a
  call, also when the rows differ in stored state."
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.dimension :as dimension]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-fields!
  "The ids of `n` new Fields of the Table with `table-id`, whose names start with `prefix`, with `extra` columns."
  [table-id prefix n extra]
  (vec (t2/insert-returning-pks! :model/Field
                                 (for [i (range n)]
                                   (merge {:table_id      table-id
                                           :name          (str prefix i)
                                           :base_type     :type/Integer
                                           :database_type "INTEGER"
                                           :position      0}
                                          extra)))))

(defn- insert-tables!
  "The ids of `n` new Tables of the Database with `db-id`."
  [db-id n]
  (vec (t2/insert-returning-pks! :model/Table
                                 (for [i (range n)]
                                   {:db_id db-id :name (str "T" i) :active true}))))

(defn- counted!
  "The number of statements `thunk` runs."
  [thunk]
  (events.tu/statement-count! thunk))

(deftest field-write-functions-statement-counts-do-not-grow-with-rows-test
  (testing "creating Fields, some with a foreign key target"
    (let [create! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [[target-id] (insert-fields! table-id "Target" 1 {})]
                        (counted! #(field/create-fields!
                                    (vec (for [i (range n)]
                                           (cond-> {:table_id table-id :name (str "N" i) :base_type :type/Integer :database_type "INTEGER"}
                                             (odd? i) (assoc :semantic_type :type/FK :fk_target_field_id target-id)))))))))]
      (create! 1)
      (is (= (create! 2) (create! 6)))))
  (testing "updating Fields"
    (let [update! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids         (insert-fields! table-id "F" n {})
                            [target-id] (insert-fields! table-id "Target" 1 {})]
                        (counted! #(field/update-fields! ids {:description "x" :semantic_type :type/FK :fk_target_field_id target-id})))))]
      (update! 1)
      (is (= (update! 2) (update! 6)))))
  (testing "renaming the Fields of Dimensions"
    (let [update! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids (insert-fields! table-id "F" n {})]
                        (t2/insert! :model/Dimension (for [id ids] {:field_id id :type :internal :name "D"}))
                        (counted! #(field/update-fields! ids {:display_name "Renamed"})))))]
      (update! 1)
      (is (= (update! 2) (update! 6)))))
  (testing "deactivating Fields that foreign keys and Dimensions point at"
    (let [update! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [targets (insert-fields! table-id "T" n {})
                            sources (insert-fields! table-id "S" n {})
                            others  (insert-fields! table-id "O" n {})]
                        (doseq [[source target] (map vector sources targets)]
                          (t2/update! :model/Field :id source {:semantic_type :type/FK :fk_target_field_id target}))
                        (t2/insert! :model/Dimension (for [[other target] (map vector others targets)]
                                                       {:field_id other :type :external :name "D" :human_readable_field_id target}))
                        (counted! #(field/update-fields! targets {:active false})))))]
      (update! 1)
      (is (= (update! 2) (update! 6))))))

(deftest field-json-case-position-and-delete-statement-counts-do-not-grow-with-rows-test
  (testing "changing whether JSON Fields unfold"
    (let [update! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [parents (insert-fields! table-id "J" n {:json_unfolding true :base_type :type/JSON})]
                        (t2/insert! :model/Field (for [i (range n)]
                                                   {:table_id table-id :name (str "J" i " → a") :nfc_path [(str "J" i) "a"]
                                                    :base_type :type/Integer :database_type "INTEGER" :position 0}))
                        (counted! #(field/update-fields! parents {:json_unfolding false})))))]
      (update! 1)
      (is (= (update! 2) (update! 6)))))
  (testing "changing the case of names"
    (let [change! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids (insert-fields! table-id "F" n {})]
                        (counted! #(field/change-case! ids :upper [:name])))))]
      (change! 1)
      (is (= (change! 2) (change! 6)))))
  (testing "setting positions and custom positions"
    (let [assign! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids (insert-fields! table-id "F" n {})]
                        (counted! (fn []
                                    (field/set-positions! (zipmap ids (range)))
                                    (field/set-custom-positions! (zipmap ids (range))))))))]
      (assign! 1)
      (is (= (assign! 2) (assign! 6)))))
  (testing "deleting Fields, some with nested Fields"
    (let [delete! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids (insert-fields! table-id "F" n {})]
                        (t2/insert! :model/Field (for [id (take-nth 2 ids)]
                                                   {:table_id table-id :parent_id id :name "C" :base_type :type/Integer
                                                    :database_type "INTEGER" :position 0}))
                        (counted! #(field/delete-fields! ids)))))]
      (delete! 1)
      (is (= (delete! 2) (delete! 6)))))
  (testing "deleting the Fields of Tables"
    (let [delete! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [table-ids (insert-tables! db-id n)]
                        (doseq [[i table-id] (map-indexed vector table-ids)]
                          (let [ids (insert-fields! table-id "F" (inc (mod i 2)) {})]
                            (when (even? i)
                              (t2/insert! :model/Field {:table_id table-id :parent_id (first ids) :name "C" :base_type :type/Integer
                                                        :database_type "INTEGER" :position 0}))))
                        (counted! #(field/delete-fields-for-tables! table-ids)))))]
      (delete! 1)
      (is (= (delete! 2) (delete! 6))))))

(deftest table-write-functions-statement-counts-do-not-grow-with-rows-test
  (testing "creating Tables in Collections of their own"
    (let [create! (fn [n]
                    (mt/with-model-cleanup [:model/Collection]
                      (mt/with-temp [:model/Database {db-id :id} {}]
                        (let [collection-ids (t2/insert-returning-pks! :model/Collection
                                                                       (for [i (range n)] {:name (str "C" i) :slug (str "c" i)}))]
                          (counted! #(table/create-tables!
                                      (vec (map-indexed (fn [i collection-id]
                                                          {:db_id db-id :name (str "T" i) :active true :is_published true :collection_id collection-id})
                                                        collection-ids))))))))]
      (create! 1)
      (is (= (create! 2) (create! 6)))))
  (testing "creating Tables that differ in their columns"
    (let [create! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (counted! #(table/create-tables!
                                  (vec (for [i (range n)]
                                         (cond-> {:db_id db-id :name (str "T" i) :active true}
                                           (odd? i) (assoc :field_order :alphabetical :is_upload true))))))))]
      (create! 1)
      (is (= (create! 2) (create! 6)))))
  (testing "moving Tables to a Collection and changing their field order"
    (let [update! (fn [n]
                    (mt/with-model-cleanup [:model/Collection]
                      (mt/with-temp [:model/Database {db-id :id} {}]
                        (let [table-ids      (insert-tables! db-id n)
                              collection-id (t2/insert-returning-pk! :model/Collection {:name "C" :slug "c"})]
                          (doseq [table-id table-ids] (insert-fields! table-id "F" 2 {}))
                          (t2/update! :model/Table :id [:in (vec (take-nth 2 table-ids))] {:field_order :alphabetical})
                          (counted! #(table/update-tables! table-ids {:field_order :alphabetical :collection_id collection-id :is_published true}))))))]
      (update! 1)
      (is (= (update! 2) (update! 6)))))
  (testing "deactivating Tables, some already inactive"
    (let [update! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [table-ids (insert-tables! db-id n)]
                        (t2/update! :model/Table :id [:in (vec (take-nth 2 table-ids))] {:active false})
                        (counted! #(table/update-tables! table-ids {:active false})))))]
      (update! 1)
      (is (= (update! 2) (update! 6))))))

(deftest table-case-position-and-delete-statement-counts-do-not-grow-with-rows-test
  (testing "changing the case of names"
    (let [change! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [table-ids (insert-tables! db-id n)]
                        (counted! #(table/change-case! table-ids :upper [:name])))))]
      (change! 1)
      (is (= (change! 2) (change! 6)))))
  (testing "setting the positions of the Fields of Tables"
    (let [assign! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [table-ids (insert-tables! db-id n)]
                        (doseq [table-id table-ids] (insert-fields! table-id "F" 2 {}))
                        (counted! #(table/update-field-positions!
                                    (mapv (fn [i id] {:id id :field_order (if (even? i) :alphabetical :database)})
                                          (range) table-ids))))))]
      (assign! 1)
      (is (= (assign! 2) (assign! 6)))))
  (testing "deleting Tables with Fields"
    (let [delete! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [table-ids (insert-tables! db-id n)]
                        (doseq [table-id table-ids] (insert-fields! table-id "F" 2 {}))
                        (counted! #(table/delete-tables! table-ids)))))]
      (delete! 1)
      (is (= (delete! 2) (delete! 6))))))

(deftest dimension-write-functions-statement-counts-do-not-grow-with-rows-test
  (testing "creating Dimensions with and without a human-readable Field"
    (let [create! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids       (insert-fields! table-id "F" n {})
                            [target]  (insert-fields! table-id "T" 1 {})]
                        (counted! #(dimension/create-dimensions!
                                    (vec (map-indexed (fn [i id]
                                                        (if (odd? i)
                                                          {:field_id id :type :external :name "D" :human_readable_field_id target}
                                                          {:field_id id :type :internal :name "D"}))
                                                      ids)))))))]
      (create! 1)
      (is (= (create! 2) (create! 6)))))
  (testing "updating Dimensions, some of which already hold the new name"
    (let [update! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids      (insert-fields! table-id "F" n {})
                            [target] (insert-fields! table-id "T" 1 {})
                            dim-ids  (t2/insert-returning-pks! :model/Dimension
                                                               (for [id ids] {:field_id id :type :external :name "D" :human_readable_field_id target}))]
                        (t2/update! :model/Dimension :id [:in (vec (take-nth 2 dim-ids))] {:name "E"})
                        (counted! #(dimension/update-dimensions! dim-ids {:name "E" :human_readable_field_id target})))))]
      (update! 1)
      (is (= (update! 2) (update! 6)))))
  (testing "deleting Dimensions"
    (let [delete! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids     (insert-fields! table-id "F" n {})
                            dim-ids (t2/insert-returning-pks! :model/Dimension (for [id ids] {:field_id id :type :internal :name "D"}))]
                        (counted! #(dimension/delete-dimensions! dim-ids)))))]
      (delete! 1)
      (is (= (delete! 2) (delete! 6)))))
  (testing "renaming the Dimensions of Fields"
    (let [rename! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids (insert-fields! table-id "F" n {})]
                        (t2/insert! :model/Dimension (for [id ids] {:field_id id :type :internal :name "D"}))
                        (counted! #(dimension/rename-dimensions-for-fields! (zipmap ids (map (fn [i] (str "N" i)) (range))))))))]
      (rename! 1)
      (is (= (rename! 2) (rename! 6))))))

(deftest field-values-write-functions-statement-counts-do-not-grow-with-rows-test
  (testing "creating FieldValues of Fields that have advanced ones"
    (let [create! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids (insert-fields! table-id "F" n {})]
                        (t2/insert! :model/FieldValues (for [id (take-nth 2 ids)] {:field_id id :type :advanced :hash_key (str "k" id) :values [1]}))
                        (counted! #(field-values/create-field-values! (mapv (fn [id] {:field_id id :values [1 2]}) ids))))))]
      (create! 1)
      (is (= (create! 2) (create! 6)))))
  (testing "updating FieldValues, some with advanced ones and some that already hold the new values"
    (let [update! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids    (insert-fields! table-id "F" n {})
                            fv-ids (t2/insert-returning-pks! :model/FieldValues (for [id ids] {:field_id id :type :full :values [1]}))]
                        (t2/insert! :model/FieldValues (for [id (take-nth 2 ids)] {:field_id id :type :advanced :hash_key (str "k" id) :values [1]}))
                        (t2/update! :model/FieldValues :id [:in (vec (take-nth 2 fv-ids))] {:values [3]})
                        (counted! #(field-values/update-field-values! fv-ids {:values [3]})))))]
      (update! 1)
      (is (= (update! 2) (update! 6)))))
  (testing "deleting FieldValues by id, of Fields, of Tables"
    (let [delete! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [table-ids (insert-tables! db-id n)
                            ids       (vec (mapcat #(insert-fields! % "F" 2 {}) table-ids))
                            fv-ids    (t2/insert-returning-pks! :model/FieldValues (for [id ids] {:field_id id :type :full :values [1]}))]
                        (counted! (fn []
                                    (field-values/delete-field-values! fv-ids)
                                    (field-values/delete-field-values-for-fields! ids)
                                    (field-values/delete-field-values-for-tables! table-ids))))))]
      (delete! 1)
      (is (= (delete! 2) (delete! 6))))))

(deftest field-user-settings-write-functions-statement-counts-do-not-grow-with-rows-test
  (testing "creating FieldUserSettings, some that hold no user value"
    (let [create! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids (insert-fields! table-id "F" n {})]
                        (counted! #(field-user-settings/create-field-user-settings!
                                    (vec (map-indexed (fn [i id] (if (odd? i)
                                                                   {:field_id id :description "d"}
                                                                   {:field_id id :display_name "N"}))
                                                      ids)))))))]
      (create! 1)
      (is (= (create! 2) (create! 6)))))
  (testing "updating FieldUserSettings, some that already hold the new value"
    (let [update! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids          (insert-fields! table-id "F" n {})
                            settings-ids (t2/insert-returning-pks! :model/FieldUserSettings
                                                                   (for [id ids] {:field_id id :description "d" :description_set true}))]
                        (t2/update! :model/FieldUserSettings :id [:in (vec (take-nth 2 settings-ids))] {:description "e"})
                        (counted! #(field-user-settings/update-field-user-settings-for-import!
                                    (mapv (fn [id] {:id id :description "e"}) settings-ids))))))]
      (update! 1)
      (is (= (update! 2) (update! 6))))))

(deftest field-user-settings-position-delete-and-clear-statement-counts-do-not-grow-with-rows-test
  (testing "setting custom positions, for Fields with and without settings"
    (let [assign! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids (insert-fields! table-id "F" n {})]
                        (t2/insert! :model/FieldUserSettings (for [id (take-nth 2 ids)] {:field_id id :custom_position 9}))
                        (counted! #(field-user-settings/set-custom-positions! (zipmap ids (range)))))))]
      (assign! 1)
      (is (= (assign! 2) (assign! 6)))))
  (testing "deleting the settings of Fields"
    (let [delete! (fn [n]
                    (mt/with-temp [:model/Database db {}
                                   :model/Table {table-id :id} {:db_id (:id db)}]
                      (let [ids (insert-fields! table-id "F" n {})]
                        (t2/insert! :model/FieldUserSettings (for [id (take-nth 2 ids)] {:field_id id :description "d" :description_set true}))
                        (counted! #(field-user-settings/delete-field-user-settings-for-fields! ids)))))]
      (delete! 1)
      (is (= (delete! 2) (delete! 6)))))
  (testing "clearing the foreign keys to deactivated Fields"
    (let [clear! (fn [n]
                   (mt/with-temp [:model/Database db {}
                                  :model/Table {table-id :id} {:db_id (:id db)}]
                     (let [targets (insert-fields! table-id "T" n {})
                           sources (insert-fields! table-id "S" n {})]
                       (t2/insert! :model/FieldUserSettings
                                   (for [[i source target] (map vector (range) sources targets)]
                                     (cond-> {:field_id source :semantic_type :type/FK :semantic_type_set true :description_set false
                                              :fk_target_field_id target :fk_target_field_id_set true}
                                       (odd? i) (assoc :description "d" :description_set true))))
                       (counted! #(field-user-settings/update-field-user-settings-for-deactivated-fields! targets)))))]
      (clear! 1)
      (is (= (clear! 2) (clear! 6))))))

(deftest table-user-settings-write-functions-statement-counts-do-not-grow-with-rows-test
  (testing "creating TableUserSettings, some that hold no user value"
    (let [create! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [ids (insert-tables! db-id n)]
                        (counted! #(table-user-settings/create-table-user-settings!
                                    (vec (map-indexed (fn [i id] (if (odd? i)
                                                                   {:table_id id :caveats "c"}
                                                                   {:table_id id :display_name "N"}))
                                                      ids)))))))]
      (create! 1)
      (is (= (create! 2) (create! 6)))))
  (testing "updating TableUserSettings, some that already hold the new value"
    (let [update! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [ids          (insert-tables! db-id n)
                            settings-ids (t2/insert-returning-pks! :model/TableUserSettings
                                                                   (for [id ids] {:table_id id :caveats "c" :caveats_set true}))]
                        (t2/update! :model/TableUserSettings :id [:in (vec (take-nth 2 settings-ids))] {:caveats "e"})
                        (counted! #(table-user-settings/update-table-user-settings! settings-ids {:caveats "e"})))))]
      (update! 1)
      (is (= (update! 2) (update! 6)))))
  (testing "upserting one value for Tables, some with settings"
    (let [upsert! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [ids (insert-tables! db-id n)]
                        (t2/insert! :model/TableUserSettings (for [id (take-nth 2 ids)] {:table_id id :caveats "c" :caveats_set true}))
                        (counted! #(table-user-settings/upsert-table-user-settings-for-tables! (set ids) {:caveats "e"})))))]
      (upsert! 1)
      (is (= (upsert! 2) (upsert! 6)))))
  (testing "deleting the settings of Tables"
    (let [delete! (fn [n]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [ids (insert-tables! db-id n)]
                        (t2/insert! :model/TableUserSettings (for [id (take-nth 2 ids)] {:table_id id :caveats "c" :caveats_set true}))
                        (counted! #(table-user-settings/delete-table-user-settings-for-tables! ids)))))]
      (delete! 1)
      (is (= (delete! 2) (delete! 6))))))

(deftest legacy-field-settings-load-statement-counts-do-not-grow-with-tables-test
  (testing "loading TableUserSettings of an older export, which nest the FieldUserSettings of their Tables"
    (let [load! (fn [n]
                  (mt/with-model-cleanup [:model/TableUserSettings :model/FieldUserSettings]
                    (mt/with-temp [:model/Database {db-id :id} {}]
                      (let [table-ids (insert-tables! db-id n)
                            field-ids (mapv #(first (insert-fields! % "F" 2 {})) table-ids)]
                        (table-user-settings/create-table-user-settings!
                         (mapv (fn [id] {:table_id id :field_order :alphabetical}) table-ids))
                        (field-user-settings/create-field-user-settings!
                         (mapv (fn [id] {:field_id id :description "d"}) field-ids))
                        (let [tables   (into [] (serialization/export :model/TableUserSettings
                                                                      (t2/select :model/TableUserSettings :table_id [:in table-ids])))
                              fields   (into [] (serialization/export :model/FieldUserSettings
                                                                      (t2/select :model/FieldUserSettings :field_id [:in field-ids])))
                              entities (mapv (fn [table]
                                               (assoc table :fields (filterv #(= (:table_id table) (vec (butlast (:field_id %)))) fields)))
                                             tables)]
                          (counted! #(serialization/load :model/TableUserSettings entities)))))))]
      (load! 1)
      (is (= (load! 2) (load! 6))))))
