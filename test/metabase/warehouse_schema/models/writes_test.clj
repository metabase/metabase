(ns metabase.warehouse-schema.models.writes-test
  "Behavior of the bulk write functions of the warehouse-schema models."
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
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
      (let [[parent-id] (mapv :id (field/create-fields! (field-rows table-id 1)))
            [child-id]  (mapv :id (field/create-fields! [(assoc (first (field-rows table-id 1)) :name "C" :parent_id parent-id)]))
            [leaf-id]   (mapv :id (field/create-fields! [(assoc (first (field-rows table-id 1)) :name "L" :parent_id child-id)]))]
        (field/delete-fields! [parent-id])
        (is (empty? (t2/select :model/Field :id [:in [parent-id child-id leaf-id]])))))))

(def ^:private published (atom []))

(doseq [topic [:event/table-create :event/table-update :event/table-delete
               :event/field-create :event/field-update :event/field-delete]]
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
        (field/update-fields! (for [id ids] {:id id :description "D"}))
        (is (=? [[:event/field-update {:changes [{:object {:description "D"} :previous-object {:description nil}}
                                                 {:object {:description "D"}}
                                                 {:object {:description "D"}}]}]]
                @published))
        (testing "an update that changes nothing publishes no change"
          (reset! published [])
          (field/update-fields! (for [id ids] {:id id :description "D"}))
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

(defn- topics-and-row-counts
  "The topics published so far, each with the number of rows its event carries."
  []
  (mapv (fn [[topic event]] [topic (count (:changes event))]) @published))

(deftest ^:synchronized writes-across-partitions-publish-one-event-test
  (testing "Fields and Tables written in batches of two publish one event per call, carrying every row"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (mt/with-model-cleanup [:model/Table]
        (mt/with-partition-size 2
          (reset! published [])
          (let [fields (field/create-fields! (field-rows table-id 5))
                ids    (mapv :id fields)]
            (testing "creating Fields returns them in input order"
              (is (= ["F0" "F1" "F2" "F3" "F4"] (mapv :name fields)))
              (is (= [[:event/field-create 5]] (topics-and-row-counts))))
            (testing "updating Fields with a value of their own"
              (reset! published [])
              (field/update-fields! (vec (map-indexed (fn [i id] {:id id :description (str "D" i)}) ids)))
              (is (= [[:event/field-update 5]] (topics-and-row-counts)))
              (is (= ["D0" "D1" "D2" "D3" "D4"]
                     (t2/select-fn-vec :description :model/Field :id [:in ids] {:order-by [:id]}))))
            (testing "reading the FieldValues of more Fields than one batch"
              (field-values/create-field-values! (mapv (fn [id] {:field_id id :values [1]}) ids))
              (is (= 5 (count (field-values/ids-of-fields ids)))))
            (testing "deleting Fields"
              (reset! published [])
              (field/delete-fields! ids)
              (is (= [[:event/field-delete 5]] (topics-and-row-counts)))
              (is (not (t2/exists? :model/Field :id [:in ids])))))
          (reset! published [])
          (let [tables (table/create-tables! (vec (for [i (range 5)] {:db_id db-id :name (str "P" i) :active true})))
                ids    (mapv :id tables)]
            (testing "creating Tables returns them in input order"
              (is (= ["P0" "P1" "P2" "P3" "P4"] (mapv :name tables)))
              (is (= [[:event/table-create 5]] (topics-and-row-counts))))
            (testing "updating Tables with a value of their own"
              (reset! published [])
              (table/update-tables! (vec (map-indexed (fn [i id] {:id id :description (str "D" i)}) ids)))
              (is (= [[:event/table-update 5]] (topics-and-row-counts)))
              (is (= ["D0" "D1" "D2" "D3" "D4"]
                     (t2/select-fn-vec :description :model/Table :id [:in ids] {:order-by [:id]}))))
            (testing "deleting Tables"
              (reset! published [])
              (table/delete-tables! ids)
              (is (= [[:event/table-delete 5]] (topics-and-row-counts)))
              (is (not (t2/exists? :model/Table :id [:in ids]))))))))))

(deftest ^:synchronized writes-run-one-batch-per-partition-test
  (testing "creating, updating and deleting five Fields and five Tables in batches of two runs more statements than in
            one batch, so the batches are real"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (mt/with-model-cleanup [:model/Table]
        (let [round! (fn []
                       (events.tu/statement-count!
                        (fn []
                          (let [field-ids (mapv :id (field/create-fields! (field-rows table-id 5)))
                                table-ids (mapv :id (table/create-tables! (vec (for [i (range 5)]
                                                                                 {:db_id db-id :name (str "B" i) :active true}))))]
                            (field/update-fields! (vec (for [id field-ids] {:id id :description "D"})))
                            (table/update-tables! (vec (for [id table-ids] {:id id :description "D"})))
                            (field/delete-fields! field-ids)
                            (table/delete-tables! table-ids)))))]
          (round!)
          (let [one-batch (round!)]
            (is (< one-batch
                   (mt/with-partition-size 2
                     (round!))))))))))

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

(deftest create-table-user-settings-reports-first-invalid-row-test
  (mt/with-temp [:model/Database   {db-id :id}      {}
                 :model/Table      {table-id :id}       {:db_id db-id}
                 :model/Table      {other-table-id :id} {:db_id db-id}
                 :model/Collection {metrics-id :id}    {:type "library-metrics"}
                 :model/Collection {dashboards-id :id} {:type "library-dashboards"}]
    (let [create (fn [& collection-ids]
                   (try (table-user-settings/create-table-user-settings!
                         (mapv (fn [table-id collection-id]
                                 {:table_id table-id :is_published true :collection_id collection-id})
                               [table-id other-table-id]
                               collection-ids))
                        nil
                        (catch clojure.lang.ExceptionInfo e (ex-message e))))]
      (is (= "Can only add metrics to the 'Metrics' collection" (create metrics-id dashboards-id)))
      (is (= "Cannot add tables or regular collections to the 'Dashboards' collection" (create dashboards-id metrics-id)))
      (is (zero? (t2/count :model/TableUserSettings :table_id [:in [table-id other-table-id]]))))))

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
          (is (refused? #(field/update-fields! [{:id source-id :semantic_type :type/FK :fk_target_field_id other-id}])))
          (is (nil? (t2/select-one-fn :fk_target_field_id :model/Field :id source-id)))
          (field/update-fields! [{:id source-id :semantic_type :type/FK :fk_target_field_id same-id}])
          (is (= same-id (t2/select-one-fn :fk_target_field_id :model/Field :id source-id))))
        (testing "Dimension creation and update"
          (is (refused? #(dimension/create-dimensions! [{:field_id source-id :type :external :name "D" :human_readable_field_id other-id}])))
          (is (not (t2/exists? :model/Dimension :field_id source-id)))
          (let [[dimension] (dimension/create-dimensions! [{:field_id source-id :type :external :name "D" :human_readable_field_id same-id}])]
            (is (refused? #(dimension/update-dimensions! [{:id (:id dimension) :human_readable_field_id other-id}])))
            (is (= same-id (t2/select-one-fn :human_readable_field_id :model/Dimension :id (:id dimension))))))))))

(defn- user-settings-fields!
  "Inserts into the Table with `table-id` the Fields the upsert tests write: one without settings, one with settings,
  a foreign key with a user-set target and an external remapping, and an integer Field with an internal remapping;
  returns their ids by name."
  [table-id]
  (let [[target-id] (mapv :id (field/create-fields! [{:table_id table-id :name "TARGET" :base_type :type/Integer
                                                      :database_type "INTEGER"}]))
        ids         (zipmap ["BARE" "SET" "FK" "REMAPPED"]
                            (mapv :id (field/create-fields! (field-rows table-id 4))))]
    (field/update-fields! [{:id (ids "SET") :description "old"}
                           {:id (ids "FK") :semantic_type :type/FK :fk_target_field_id target-id}])
    (t2/insert! :model/FieldUserSettings {:field_id (ids "SET") :description "old" :description_set true})
    (t2/insert! :model/FieldUserSettings {:field_id (ids "FK") :fk_target_field_id target-id
                                          :fk_target_field_id_set true :description "kept" :description_set true})
    (dimension/create-dimensions! [{:field_id (ids "FK") :type :external :name "E" :human_readable_field_id target-id}
                                   {:field_id (ids "REMAPPED") :type :internal :name "I"}])
    ids))

(def ^:private upsert-changes
  "The settings the upsert tests write, by Field name."
  {"BARE"     {:description "new bare" :display_name "Bare"}
   "SET"      {:description "new set"}
   "FK"       {:semantic_type :type/Category}
   "REMAPPED" {:semantic_type :type/Quantity :display_name "Remapped"}})

(defn- user-settings-state
  "The settings, Field columns and Dimensions of the Fields with `ids`, by name."
  [ids]
  (into {}
        (map (fn [[field-name id]]
               [field-name
                {:settings   (some-> (t2/select-one :model/FieldUserSettings :field_id id)
                                     (select-keys [:description :display_name :semantic_type :fk_target_field_id
                                                   :description_set :semantic_type_set :fk_target_field_id_set]))
                 :field      (-> (t2/select-one :model/Field :id id)
                                 (select-keys [:description :display_name :semantic_type :fk_target_field_id])
                                 (update :fk_target_field_id some?))
                 :dimensions (t2/select-fn-set :type :model/Dimension :field_id id)}]))
        ids))

(deftest upsert-field-user-settings-for-fields-test
  (testing "upserting the settings of several Fields at once stores what upserting them one by one stores"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {one-by-one :id} {:db_id db-id}
                   :model/Table    {at-once :id}  {:db_id db-id}]
      (let [one-ids  (user-settings-fields! one-by-one)
            bulk-ids (user-settings-fields! at-once)
            field-of #(t2/select-one :model/Field :id %)]
        (doseq [[field-name settings] upsert-changes]
          (field-user-settings/upsert-field-user-settings! (field-of (one-ids field-name)) settings))
        (is (= 4 (field-user-settings/upsert-field-user-settings-for-fields!
                  (vec (for [[field-name settings] upsert-changes]
                         [(field-of (bulk-ids field-name)) settings])))))
        (let [expected (user-settings-state one-ids)]
          (is (= {:description "new set" :description_set true}
                 (select-keys (:settings (expected "SET")) [:description :description_set])))
          (is (every? (comp empty? :dimensions) (vals expected)))
          (is (= expected (user-settings-state bulk-ids))))))))
