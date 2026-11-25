(ns metabase.warehouse-schema.models.table-user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
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
      (is (=? {:is_published true :collection_id collection-id}
              (t2/select-one :model/TableUserSettings :table_id table-id)))
      (testing "a Table published into the root collection keeps its NULL collection_id"
        (table-user-settings/upsert-table-user-settings! table {:is_published true :collection_id nil})
        (is (=? {:is_published true :collection_id nil}
                (t2/select-one :model/TableUserSettings :table_id table-id)))))))

(deftest only-published-tables-sit-in-collections-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Table      {table-id :id} {}]
    (testing "inserting settings that put unpublished Table into Collection is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Only a published Table can be in a Collection"
                            (t2/insert! :model/TableUserSettings {:table_id table-id :collection_id coll-id})))
      (is (nil? (t2/select-one :model/TableUserSettings :table_id table-id))))
    (t2/insert! :model/TableUserSettings {:table_id table-id :display_name "Unpublished"})
    (testing "putting an unpublished Table into a Collection is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Only a published Table can be in a Collection"
                            (t2/update! :model/TableUserSettings :table_id table-id {:collection_id coll-id}))))
    (testing "publishing a Table into a Collection is accepted"
      (t2/update! :model/TableUserSettings :table_id table-id {:is_published true :collection_id coll-id})
      (is (= [true coll-id] ((juxt :is_published :collection_id)
                             (t2/select-one :model/TableUserSettings :table_id table-id)))))
    (testing "unpublishing a Table while it stays in its Collection is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Only a published Table can be in a Collection"
                            (t2/update! :model/TableUserSettings :table_id table-id {:is_published false}))))
    (testing "a published Table without a Collection is accepted"
      (t2/update! :model/TableUserSettings :table_id table-id {:collection_id nil})
      (is (= [true nil] ((juxt :is_published :collection_id)
                         (t2/select-one :model/TableUserSettings :table_id table-id)))))))

(deftest collection-of-published-table-test
  (testing "collection_id FK constraint prevents referencing non-existent collection"
    (mt/with-temp [:model/Table {table-id :id} {}]
      (is (thrown?
           Exception
           (t2/with-transaction [_conn]
             (t2/insert! :model/TableUserSettings
                         {:table_id table-id :is_published true :collection_id Integer/MAX_VALUE}))))
      (is (= table-id (:id (user-table table-id))))))
  (testing "deleting a collection unpublishes the tables in it"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Table {table-1-id :id} {}
                   :model/TableUserSettings _ {:table_id table-1-id :is_published true :collection_id coll-id}
                   :model/Table {table-2-id :id} {}
                   :model/TableUserSettings _ {:table_id table-2-id :is_published true :collection_id coll-id}]
      (collection/delete-collections! [coll-id])
      (is (= #{[false nil]} (t2/select-fn-set (juxt :is_published :collection_id) :model/TableUserSettings
                                              :table_id [:in [table-1-id table-2-id]]))))))

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
                            [:load_strategy :upsert]]]
      (testing (pr-str column value)
        (is (=? {:status-code 400, :errors {column some?}}
                (try
                  (t2/insert! :model/TableUserSettings {:table_id table-id, :display_name "User Name", column value})
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    (ex-data e)))))))))

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

(defn- do-with-definition-fields
  "Call `f` with a Table, and the structural metadata a user and sync write to it, whose definitions hold Fields of the
  Table and a definition Table of its Database."
  [f]
  (mt/with-temp [:model/Table {table-id :id :as table} {:db_id (mt/id)}
                 :model/Table {definitions-id :id}    {:db_id (mt/id)}
                 :model/Field {field-1 :id}           {:table_id table-id}
                 :model/Field {field-2 :id}           {:table_id table-id}]
    (f table
       (assoc structural-metadata
              :history_definition {:valid_from field-1}
              :eav_definition     {:entity_key field-2, :definition_table definitions-id})
       (assoc synced-structural-metadata
              :history_definition {:durable_key field-2}
              :eav_definition     {:entity_key field-1}))))

(deftest user-structural-metadata-sets-flags-test
  (do-with-definition-fields
   (fn [{table-id :id :as table} user-metadata _synced-metadata]
     (table-user-settings/upsert-table-user-settings! table user-metadata)
     (is (=? user-metadata (user-table table-id)))
     (is (=? (merge user-metadata structural-metadata-flags)
             (t2/select-one :model/TableUserSettings :table_id table-id))))))

(deftest sync-skips-user-structural-metadata-test
  (do-with-definition-fields
   (fn [{table-id :id :as table} user-metadata synced-metadata]
     (table-user-settings/upsert-table-user-settings! table user-metadata)
     (sync.updates/update-table-unless-user-set! table-id synced-metadata)
     (is (=? user-metadata (user-table table-id))))))

(deftest user-null-structural-metadata-is-kept-test
  (let [nulls (update-vals structural-metadata (constantly nil))]
    (mt/with-temp [:model/Table {table-id :id :as table} synced-structural-metadata]
      (table-user-settings/upsert-table-user-settings! table nulls)
      (is (=? (merge nulls structural-metadata-flags) (t2/select-one :model/TableUserSettings :table_id table-id)))
      (sync.updates/update-table-unless-user-set! table-id synced-structural-metadata)
      (is (= nulls (select-keys (user-table table-id) (keys nulls)))))))

(deftest unset-structural-metadata-clears-flags-test
  (do-with-definition-fields
   (fn [{table-id :id :as table} user-metadata synced-metadata]
     (table-user-settings/upsert-table-user-settings! table (assoc user-metadata :display_name "User Name"))
     (table-user-settings/unset-table-user-settings! table (vec (keys user-metadata)))
     (is (=? (merge (update-vals user-metadata (constantly nil))
                    (update-vals structural-metadata-flags (constantly false)))
             (t2/select-one :model/TableUserSettings :table_id table-id)))
     (sync.updates/update-table-unless-user-set! table-id synced-metadata)
     (is (=? synced-metadata (user-table table-id))))))
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

(defn- definition-errors
  "The `:errors` of the 400 that `thunk` throws, or nil when it throws none; any other exception is rethrown."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (if (= 400 (:status-code (ex-data e)))
        (:errors (ex-data e))
        (throw e)))))

(def ^:private misplaced-durable-key
  "The errors of a `history_definition` whose `durable_key` is a Field of another Table."
  {:history_definition "durable_key must be a Field of this Table"})

(deftest rejected-definition-leaves-no-settings-test
  (testing "a definition the Table's write function rejects rolls back the settings written with it"
    (mt/with-temp [:model/Table {table-id :id :as table} {:db_id (mt/id)}
                   :model/Table {other-id :id}           {:db_id (mt/id)}
                   :model/Field {other-field :id}        {:table_id other-id}]
      (let [bad {:description "User Description" :history_definition {:durable_key other-field}}]
        (testing "with no settings stored"
          (is (= misplaced-durable-key
                 (definition-errors #(table-user-settings/upsert-table-user-settings! table bad))))
          (is (nil? (t2/select-one :model/TableUserSettings :table_id table-id))))
        (testing "with settings stored"
          (table-user-settings/upsert-table-user-settings! table {:caveats "User Caveats"})
          (let [stored (t2/select-one :model/TableUserSettings :table_id table-id)]
            (testing "through upsert-table-user-settings!"
              (is (= misplaced-durable-key
                     (definition-errors #(table-user-settings/upsert-table-user-settings! table bad)))))
            (testing "through upsert-table-user-settings-for-tables!"
              (is (= misplaced-durable-key
                     (definition-errors
                       #(table-user-settings/upsert-table-user-settings-for-tables! #{table-id} bad)))))
            (testing "through update-table-user-settings!, with the flags an import carries"
              (is (= misplaced-durable-key
                     (definition-errors
                       #(table-user-settings/update-table-user-settings!
                         [(assoc bad :id (:id stored) :description_set true :history_definition_set true)])))))
            (is (= stored (t2/select-one :model/TableUserSettings :table_id table-id)))
            (is (=? {:description nil :caveats "User Caveats" :history_definition nil} (user-table table-id)))))
        (testing "through create-table-user-settings!"
          (mt/with-temp [:model/Table {fresh-id :id} {:db_id (mt/id)}]
            (is (= misplaced-durable-key
                   (definition-errors
                     #(table-user-settings/create-table-user-settings!
                       [(assoc bad :table_id fresh-id :history_definition_set true)]))))
            (is (nil? (t2/select-one :model/TableUserSettings :table_id fresh-id)))))))))
