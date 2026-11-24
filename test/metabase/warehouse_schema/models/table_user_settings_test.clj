(ns metabase.warehouse-schema.models.table-user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.updates :as sync.updates]
   [metabase.test :as mt]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [toucan2.core :as t2]))

(defn- user-table
  "The Table row."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(deftest table-user-settings-write-table-row-test
  (mt/with-temp [:model/Table {table-id :id :as table} {:name         "sync_name"
                                                        :display_name "Sync Name"
                                                        :description  "sync description"
                                                        :entity_type  :entity/GenericTable}]
    (table-user-settings/upsert-table-user-settings! table {:display_name "User Name" :description nil})
    (testing "user values, user NULL included, are written to Table; rest of row is intact"
      (is (=? {:id table-id :display_name "User Name" :description nil :entity_type :entity/GenericTable}
              (user-table table-id))))
    (testing "settings record which columns user set"
      (is (=? {:display_name "User Name" :description nil :description_set true}
              (t2/select-one :model/TableUserSettings :table_id table-id))))
    (testing "unsetting leaves Table as it is for sync to take over"
      (table-user-settings/unset-table-user-settings! table [:display_name :description])
      (is (=? {:display_name "User Name" :description nil} (user-table table-id)))
      (is (nil? (t2/select-one :model/TableUserSettings :table_id table-id))))))

(deftest not-null-columns-need-no-flag-test
  (testing "a NULL in a column that is NOT NULL on the Table can only mean the user set nothing"
    (mt/with-temp [:model/Table {table-id :id :as table} {:field_order :database}]
      (is (= :database (:field_order (user-table table-id))))
      (table-user-settings/upsert-table-user-settings! table {:field_order :alphabetical})
      (is (= :alphabetical (:field_order (user-table table-id))))
      (testing "clearing it keeps the Table's value, and drops the row it emptied"
        (table-user-settings/unset-table-user-settings! table [:field_order])
        (is (= :alphabetical (:field_order (user-table table-id))))
        (is (nil? (t2/select-one :model/TableUserSettings :table_id table-id)))))))

(deftest visibility-pair-is-recorded-whole-test
  (testing "visibility_type and data_layer are one choice, so setting either records both"
    (mt/with-temp [:model/Table {table-id :id :as table} {}]
      (table-user-settings/upsert-table-user-settings! table {:visibility_type :hidden})
      (is (=? {:visibility_type :hidden :data_layer :hidden} (user-table table-id)))
      (table-user-settings/upsert-table-user-settings! table {:data_layer :internal})
      (is (=? {:visibility_type nil :data_layer :internal} (user-table table-id))))))

(deftest publishing-is-recorded-as-a-pair-test
  (testing "collection_id is only meaningful alongside is_published, which is NOT NULL and answers for the pair"
    (mt/with-temp [:model/Collection {collection-id :id} {}
                   :model/Table      {table-id :id :as table} {}]
      (table-user-settings/upsert-table-user-settings! table {:is_published true :collection_id collection-id})
      (is (=? {:is_published true :collection_id collection-id} (user-table table-id)))
      (testing "a Table published into the root collection keeps its NULL collection_id"
        (table-user-settings/upsert-table-user-settings! table {:is_published true :collection_id nil})
        (is (=? {:is_published true :collection_id nil} (user-table table-id)))))))

(deftest bulk-upsert-test
  (testing "a bulk edit records the same values on every Table it names"
    (mt/with-temp [:model/Table {t1 :id} {}
                   :model/Table {t2 :id} {}]
      (table-user-settings/upsert-table-user-settings-for-tables! #{t1 t2} {:owner_email "owner@example.com"})
      (is (= ["owner@example.com" "owner@example.com"]
             (map (comp :owner_email user-table) [t1 t2])))
      (is (= 2 (count (warehouse-schema.db/table-ids-with-user-settings #{t1 t2})))))))

(deftest invariants-hold-however-the-row-is-written-test
  (testing "the model's hooks, not just the upsert fns, enforce what has to hold of a settings row -- so a serdes
            import or any other writer cannot store one that readers would misread"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-id :id :as table} {:db_id db-id}
                   :model/Field    {field-id :id} {:table_id table-id}]
      (testing "a written column carries its _set flag, on insert and on update"
        (t2/insert! :model/FieldUserSettings {:field_id field-id :description "d"})
        (is (true? (t2/select-one-fn :description_set :model/FieldUserSettings :field_id field-id)))
        (t2/update! :model/FieldUserSettings :field_id field-id {:semantic_type :type/Category})
        (is (true? (t2/select-one-fn :semantic_type_set :model/FieldUserSettings :field_id field-id))))
      (testing "a flag the writer set itself is left alone, which is how a value is taken back"
        (t2/insert! :model/TableUserSettings {:table_id table-id :display_name "n" :description "d"})
        (t2/update! :model/TableUserSettings :table_id table-id {:description nil :description_set false})
        (is (false? (t2/select-one-fn :description_set :model/TableUserSettings :table_id table-id))))
      (testing "both halves of the visibility choice move together"
        (table-user-settings/update-table-user-settings!
         [{:id (t2/select-one-pk :model/TableUserSettings :table_id table-id) :visibility_type :hidden}])
        (is (=? {:visibility_type :hidden :data_layer :hidden
                 :visibility_type_set true :data_layer_set true}
                (t2/select-one :model/TableUserSettings :table_id table-id))))
      (testing "a change the Table refuses rolls back its settings too"
        (table-user-settings/upsert-table-user-settings! table {:data_authority :authoritative})
        (is (thrown-with-msg? Exception #"Cannot set data_authority back to unconfigured"
                              (table-user-settings/upsert-table-user-settings! table {:data_authority :unconfigured})))
        (is (= :authoritative (t2/select-one-fn :data_authority :model/TableUserSettings :table_id table-id)))
        (is (= :authoritative (:data_authority (user-table table-id))))))))

(deftest bulk-upsert-rolls-back-settings-test
  (testing "a bulk change one Table refuses leaves the settings of every Table as they were"
    (mt/with-temp [:model/Table {t1 :id} {:data_source :metabase-transform}
                   :model/Table {t2 :id} {}]
      (is (thrown-with-msg? Exception #"Cannot change data_source from metabase-transform"
                            (table-user-settings/upsert-table-user-settings-for-tables! #{t1 t2} {:data_source :ingested})))
      (is (empty? (warehouse-schema.db/table-ids-with-user-settings #{t1 t2})))
      (is (= [:metabase-transform nil] (map (comp :data_source user-table) [t1 t2]))))))

(deftest custom-order-fields-test
  (testing "a custom order is recorded as the Fields' user custom_position and applied to their position"
    (mt/with-temp [:model/Table {table-id :id :as table} {}
                   :model/Field {f1 :id}                {:table_id table-id :name "A"}
                   :model/Field {f2 :id}                {:table_id table-id :name "B"}]
      (table-user-settings/custom-order-fields! table [f2 f1])
      (is (= :custom (:field_order (user-table table-id))))
      (is (= {f2 0 f1 1} (t2/select-fn->fn :field_id :custom_position :model/FieldUserSettings :field_id [:in [f1 f2]])))
      (is (= [f2 f1] (t2/select-pks-vec :model/Field :table_id table-id {:order-by [[:position :asc]]})))
      (is (= {f2 0 f1 1} (t2/select-pk->fn :custom_position :model/Field :table_id table-id))))))

(deftest deleting-settings-keeps-table-row-test
  (testing "deleting the settings leaves the Table as it is for sync to take over"
    (mt/with-temp [:model/Table {table-id :id :as table} {:name "sync_name" :data_authority :unconfigured}]
      (table-user-settings/upsert-table-user-settings! table {:data_authority :authoritative
                                                              :display_name   "User Name"
                                                              :description    "user description"})
      (table-user-settings/delete-table-user-settings! (table-user-settings/ids-of-tables [table-id]))
      (is (=? {:data_authority :authoritative :description "user description" :display_name "User Name"}
              (user-table table-id)))
      (is (nil? (t2/select-one :model/TableUserSettings :table_id table-id))))))

(deftest unchanged-half-of-visibility-pair-is-recorded-test
  (testing "setting data_layer to its current value records visibility_type as set too"
    (mt/with-temp [:model/Table {table-id :id :as table} {:visibility_type :cruft :data_layer :hidden}]
      (table-user-settings/upsert-table-user-settings! table {:data_layer :hidden})
      (is (=? {:visibility_type :cruft :data_layer :hidden :visibility_type_set true :data_layer_set true}
              (t2/select-one :model/TableUserSettings :table_id table-id))))))

(def ^:private structural-metadata
  {:table_role         :role/Fact
   :grain              "order line"
   :grain_description  "One row for each line of an order"
   :period_granularity :day
   :mutability         :append_only
   :load_strategy      :incremental
   :scd_type           0
   :history_definition {:valid_from 15}
   :eav_definition     {:entity_key 31, :definition_table 9}})

(deftest structural-metadata-round-trip-test
  (mt/with-temp [:model/Table               {table-id :id} {}
                 :model/TableUserSettings   _              (assoc structural-metadata
                                                                  :table_id table-id
                                                                  :display_name "User Name")]
    (is (= structural-metadata
           (select-keys (t2/select-one :model/TableUserSettings :table_id table-id) (keys structural-metadata))))))

(deftest invalid-structural-metadata-test
  (mt/with-temp [:model/Table {table-id :id} {}]
    (doseq [[column value] [[:table_role :role/NotARole]
                            [:period_granularity :fortnight]
                            [:mutability :append-only]
                            [:load_strategy :upsert]
                            [:scd_type 8]
                            [:history_definition {:surrogate_key 12}]
                            [:eav_definition {:entity_key "31"}]]]
      (testing (pr-str column value)
        (is (=? {:status-code 400, :errors {column some?}}
                (try
                  (t2/insert! :model/TableUserSettings {:table_id table-id, :display_name "User Name", column value})
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    (ex-data e)))))))))

(deftest invalid-scd-type-update-test
  (mt/with-temp [:model/Table             {table-id :id} {}
                 :model/TableUserSettings _              {:table_id table-id, :display_name "User Name", :scd_type 1}]
    (is (=? {:status-code 400, :errors {:scd_type some?}}
            (try
              (t2/update! :model/TableUserSettings :table_id table-id {:scd_type 8})
              nil
              (catch clojure.lang.ExceptionInfo e
                (ex-data e)))))
    (is (= 1 (t2/select-one-fn :scd_type :model/TableUserSettings :table_id table-id)))))

(deftest bad-stored-structural-metadata-reads-as-nil-test
  (mt/with-temp [:model/Table             {table-id :id} {}
                 :model/TableUserSettings _              {:table_id table-id, :display_name "User Name"}]
    (t2/update! :metabase_table_user_settings :table_id table-id {:table_role         "role/NotARole"
                                                                  :mutability         "append-only"
                                                                  :history_definition "{\"surrogate_key\":12}"})
    (is (=? {:table_role nil, :mutability nil, :history_definition nil}
            (t2/select-one :model/TableUserSettings :table_id table-id)))))

(def ^:private synced-structural-metadata
  {:table_role         :role/Dimension
   :grain              "synced grain"
   :grain_description  "synced description"
   :period_granularity :week
   :mutability         :mutable
   :load_strategy      :full
   :scd_type           1
   :history_definition {:durable_key 1}
   :eav_definition     {:entity_key 2}})

(def ^:private structural-metadata-flags
  {:table_role_set true, :grain_set true, :grain_description_set true, :period_granularity_set true
   :mutability_set true, :load_strategy_set true, :scd_type_set true, :history_definition_set true
   :eav_definition_set true})

(deftest user-structural-metadata-sets-flags-test
  (mt/with-temp [:model/Table {table-id :id :as table} {}]
    (table-user-settings/upsert-table-user-settings! table structural-metadata)
    (is (=? structural-metadata (user-table table-id)))
    (is (=? (merge structural-metadata structural-metadata-flags)
            (t2/select-one :model/TableUserSettings :table_id table-id)))))

(deftest sync-skips-user-structural-metadata-test
  (mt/with-temp [:model/Table {table-id :id :as table} {}]
    (table-user-settings/upsert-table-user-settings! table structural-metadata)
    (sync.updates/update-table-unless-user-set! table-id synced-structural-metadata)
    (is (=? structural-metadata (user-table table-id)))))

(deftest user-null-structural-metadata-is-kept-test
  (let [nulls (update-vals structural-metadata (constantly nil))]
    (mt/with-temp [:model/Table {table-id :id :as table} synced-structural-metadata]
      (table-user-settings/upsert-table-user-settings! table nulls)
      (is (=? (merge nulls structural-metadata-flags) (t2/select-one :model/TableUserSettings :table_id table-id)))
      (sync.updates/update-table-unless-user-set! table-id synced-structural-metadata)
      (is (= nulls (select-keys (user-table table-id) (keys nulls)))))))

(deftest unset-structural-metadata-clears-flags-test
  (mt/with-temp [:model/Table {table-id :id :as table} {}]
    (table-user-settings/upsert-table-user-settings! table (assoc structural-metadata :display_name "User Name"))
    (table-user-settings/unset-table-user-settings! table (vec (keys structural-metadata)))
    (is (=? (merge (update-vals structural-metadata (constantly nil))
                   (update-vals structural-metadata-flags (constantly false)))
            (t2/select-one :model/TableUserSettings :table_id table-id)))
    (sync.updates/update-table-unless-user-set! table-id synced-structural-metadata)
    (is (=? synced-structural-metadata (user-table table-id)))))
(deftest upsert-after-concurrent-insert-updates-stored-row-test
  (testing "settings another writer inserts between the read and the insert are updated, not duplicated"
    (mt/with-temp [:model/Table {table-id :id :as table} {}]
      (t2/insert! :model/TableUserSettings {:table_id table-id :display_name "Other Writer"})
      (let [reads (atom 0)
            read  (mt/original-fn #'warehouse-schema.db/table-user-settings)]
        (mt/with-dynamic-fn-redefs [warehouse-schema.db/table-user-settings (fn [id]
                                                                              (when (> (swap! reads inc) 1)
                                                                                (read id)))]
          (table-user-settings/upsert-table-user-settings! table {:description "User Description"})))
      (is (=? [{:display_name "Other Writer" :description "User Description" :description_set true}]
              (t2/select :model/TableUserSettings :table_id table-id)))
      (is (= "User Description" (:description (user-table table-id)))))))
