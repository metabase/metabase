(ns metabase.warehouse-schema.models.writes-test
  "Behavior of the bulk write functions of the warehouse-schema models."
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.dimension :as dimension]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- field-rows
  "Rows of `n` new Fields of the Table with `table-id`."
  [table-id n]
  (vec (for [i (range n)]
         {:table_id table-id :name (str "F" i) :base_type :type/Integer :database_type "INTEGER"})))

(deftest field-deactivation-clears-pointers-test
  (testing "deactivating Fields clears the foreign keys to them and the remappings that read them"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (let [[target-id source-id remapped-id] (mapv :id (field/create-fields! (field-rows table-id 3)))]
        (field/update-fields! [source-id] {:semantic_type :type/FK :fk_target_field_id target-id})
        (dimension/create-dimensions! [{:field_id remapped-id :type :external :name "D"
                                        :human_readable_field_id target-id}])
        (field/update-fields! [target-id] {:active false})
        (is (=? {:semantic_type nil :fk_target_field_id nil} (t2/select-one :model/Field :id source-id)))
        (is (nil? (t2/select-one :model/Dimension :field_id remapped-id)))))))

(deftest delete-fields-deletes-nested-fields-test
  (testing "deleting a Field deletes the Fields nested under it"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (let [[parent-id] (mapv :id (field/create-fields! (field-rows table-id 1)))
            [child-id]  (mapv :id (field/create-fields! [(assoc (first (field-rows table-id 1)) :name "C" :parent_id parent-id)]))
            [leaf-id]   (mapv :id (field/create-fields! [(assoc (first (field-rows table-id 1)) :name "L" :parent_id child-id)]))]
        (field/delete-fields! [parent-id])
        (is (empty? (t2/select :model/Field :id [:in [parent-id child-id leaf-id]])))))))

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
      (let [ids (mapv :id (field/create-fields! (field-rows table-id 3)))]
        (reset! published [])
        (field/update-fields! ids {:description "D"})
        (is (=? [[:event/field-update {:changes [{:object {:description "D"} :previous-object {:description nil}}
                                                 {:object {:description "D"}}
                                                 {:object {:description "D"}}]}]]
                @published))
        (testing "an update that changes nothing publishes no change"
          (reset! published [])
          (field/update-fields! ids {:description "D"})
          (is (empty? @published)))
        (testing "the deactivation of a Table publishes one event"
          (reset! published [])
          (table/update-tables! [table-id] {:active false})
          (is (=? [[:event/table-update {:changes [{:object {:active false :deactivated_at some?}
                                                    :previous-object {:active true}}]}]]
                  @published)))
        (testing "deleting the Fields publishes one delete event"
          (reset! published [])
          (field/delete-fields! ids)
          (is (= [:event/field-delete] (map first @published)))
          (is (= (set ids) (set (map (comp :id :previous-object) (:changes (second (first @published))))))))))))

(deftest bulk-creates-keep-defaults-of-left-out-columns-test
  (testing "a bulk create of rows with different columns keeps the default of each column a row leaves out"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table-id :id} {:db_id db-id}
                   :model/Table    {other-table-id :id} {:db_id db-id}
                   :model/Field    {field-id :id} {:table_id table-id}
                   :model/Field    {other-field-id :id} {:table_id table-id}]
      (mt/with-model-cleanup [:model/Table :model/Field :model/FieldValues :model/FieldUserSettings :model/TableUserSettings]
        (testing "Tables"
          (let [[a b] (table/create-tables! [{:db_id db-id :name "Defaults A" :active true}
                                             {:db_id db-id :name "Defaults B" :active true :is_upload true}])]
            (is (= [false true] (mapv #(t2/select-one-fn :is_upload :model/Table :id (:id %)) [a b])))))
        (testing "Fields"
          (let [[a b] (field/create-fields! [{:table_id table-id :name "A" :base_type :type/Integer :database_type "INTEGER"}
                                             {:table_id      table-id
                                              :name          "B"
                                              :base_type     :type/Integer
                                              :database_type "INTEGER"
                                              :position      3}])]
            (is (= [0 3] (mapv #(t2/select-one-fn :position :model/Field :id (:id %)) [a b])))))
        (testing "FieldValues"
          (let [[a b] (field-values/create-field-values! [{:field_id field-id :values [1]}
                                                          {:field_id other-field-id :values [2] :type :full}])]
            (is (= [:full :full] (mapv #(t2/select-one-fn :type :model/FieldValues :id (:id %)) [a b])))))
        (testing "FieldUserSettings"
          (field-user-settings/create-field-user-settings! [{:field_id field-id :display_name "A"}
                                                            {:field_id other-field-id :description "B"}])
          (is (= [false true]
                 (mapv #(t2/select-one-fn :description_set :model/FieldUserSettings :field_id %) [field-id other-field-id]))))
        (testing "TableUserSettings"
          (table-user-settings/create-table-user-settings! [{:table_id table-id :display_name "A"}
                                                            {:table_id other-table-id :caveats "B" :caveats_set true}])
          (is (= [false true]
                 (mapv #(t2/select-one-fn :caveats_set :model/TableUserSettings :table_id %) [table-id other-table-id]))))))))

(deftest create-tables-reports-the-first-invalid-row-test
  (mt/with-temp [:model/Database   {db-id :id}      {}
                 :model/Collection {metrics-id :id}    {:type "library-metrics"}
                 :model/Collection {dashboards-id :id} {:type "library-dashboards"}]
    (let [row    (fn [collection-id] {:db_id db-id :name (str "T" collection-id) :active true :is_published true :collection_id collection-id})
          create (fn [& collection-ids]
                   (try (table/create-tables! (mapv row collection-ids))
                        nil
                        (catch clojure.lang.ExceptionInfo e (ex-message e))))]
      (is (= "Can only add metrics to the 'Metrics' collection" (create metrics-id dashboards-id)))
      (is (= "Cannot add tables or regular collections to the 'Dashboards' collection" (create dashboards-id metrics-id)))
      (is (zero? (t2/count :model/Table :db_id db-id))))))

(deftest reference-checks-refuse-and-write-nothing-test
  (testing "a foreign key target or a human-readable Field of another Database is refused with a 400 and nothing is kept"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table-id :id} {:db_id db-id}
                   :model/Database {other-db-id :id} {}
                   :model/Table    {other-table-id :id} {:db_id other-db-id}]
      (let [[source-id same-id]  (mapv :id (field/create-fields! (field-rows table-id 2)))
            [other-id]           (mapv :id (field/create-fields! (field-rows other-table-id 1)))
            refused?             (fn [thunk] (= 400 (:status-code (ex-data (try (thunk) nil (catch Exception e e))))))]
        (testing "Field creation"
          (is (refused? #(field/create-fields! [(assoc (first (field-rows table-id 1)) :name "X" :fk_target_field_id other-id)])))
          (is (not (t2/exists? :model/Field :table_id table-id :name "X"))))
        (testing "Field update"
          (is (refused? #(field/update-fields! [source-id] {:semantic_type :type/FK :fk_target_field_id other-id})))
          (is (nil? (t2/select-one-fn :fk_target_field_id :model/Field :id source-id)))
          (field/update-fields! [source-id] {:semantic_type :type/FK :fk_target_field_id same-id})
          (is (= same-id (t2/select-one-fn :fk_target_field_id :model/Field :id source-id))))
        (testing "Dimension creation and update"
          (is (refused? #(dimension/create-dimensions! [{:field_id source-id :type :external :name "D" :human_readable_field_id other-id}])))
          (is (not (t2/exists? :model/Dimension :field_id source-id)))
          (let [[dimension] (dimension/create-dimensions! [{:field_id source-id :type :external :name "D" :human_readable_field_id same-id}])]
            (is (refused? #(dimension/update-dimensions! [(:id dimension)] {:human_readable_field_id other-id})))
            (is (= same-id (t2/select-one-fn :human_readable_field_id :model/Dimension :id (:id dimension))))))))))
