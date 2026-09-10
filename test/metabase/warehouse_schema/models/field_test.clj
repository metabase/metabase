(ns metabase.warehouse-schema.models.field-test
  "Tests for specific behavior related to the Field model."
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.core :as warehouse-schema]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(deftest unknown-types-test
  (doseq [{:keys [column unknown-type fallback-type]} [{:column        :base_type
                                                        :unknown-type  :type/Amazing
                                                        :fallback-type :type/*}
                                                       {:column        :effective_type
                                                        :unknown-type  :type/Amazing
                                                        :fallback-type :type/*}
                                                       {:column        :semantic_type
                                                        :unknown-type  :type/Amazing
                                                        :fallback-type nil}
                                                       {:column        :coercion_strategy
                                                        :unknown-type  :Coercion/Amazing
                                                        :fallback-type nil}]]
    (testing (format "Field with unknown %s in DB should fall back to %s" column fallback-type)
      (mt/with-temp [:model/Field field]
        (t2/query-one {:update :metabase_field
                       :set    {column (u/qualified-name unknown-type)}
                       :where  [:= :id (u/the-id field)]})
        (is (= fallback-type
               (t2/select-one-fn column :model/Field :id (u/the-id field))))))
    (testing (format "Should throw an Exception if you attempt to save a Field with an invalid %s" column)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           (re-pattern (format "Invalid value for Field column %s: %s is not a descendant of any of these types:"
                               column unknown-type))
           (mt/with-temp [:model/Field field {column unknown-type}]
             field))))))

(deftest nested-field-names->field-id-test
  (mt/with-temp
    [:model/Database {db-id :id}              {}
     :model/Table    {table-id :id}           {:db_id db-id}
     :model/Field    {top-level-field-id :id} {:name    "top"
                                               :table_id table-id}
     :model/Field    {nested-field-id :id}    {:name    "nested"
                                               :table_id table-id
                                               :parent_id top-level-field-id}]
    (testing "happy path"
      (is (= top-level-field-id
             (field/nested-field-names->field-id table-id ["top"])))
      (is (= nested-field-id
             (field/nested-field-names->field-id table-id ["top" "nested"]))))
    (testing "return nothing if field does not exist"
      (is (= nil
             (field/nested-field-names->field-id table-id ["top" "nested" "not-exists"]))))))

;;; ---------------------------------------- Field permission delegation tests ----------------------------------------

(deftest field-can-read?-delegates-to-parent-table-denied-test
  (testing "Field can-read? delegates to parent table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Field {field-id :id} {:table_id table-id :name "test_field" :base_type :type/Integer}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      ;; Start with blocked permissions
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (mt/with-test-user :rasta
        (is (not (mi/can-read? (t2/select-one :model/Field field-id)))))
      ;; Grant view-data permission - field should still not be readable
      (data-perms/set-table-permission! pg table-id :perms/view-data :unrestricted)
      (mt/with-test-user :rasta
        (is (false? (boolean (mi/can-read? (t2/select-one :model/Field field-id)))))))))

(deftest field-can-read?-delegates-to-parent-table-allowed-test
  (testing "Field can-read? delegates to parent table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Field {field-id :id} {:table_id table-id :name "test_field" :base_type :type/Integer}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      ;; Start with blocked permissions
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (mt/with-test-user :rasta
        (is (not (mi/can-read? (t2/select-one :model/Field field-id)))))
      ;; Grant view-data permission - now field should be readable
      (data-perms/set-table-permission! pg table-id :perms/view-data :unrestricted)
      (data-perms/set-table-permission! pg table-id :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (is (true? (mi/can-read? (t2/select-one :model/Field field-id))))))))

(deftest field-can-query?-delegates-to-parent-table-test
  (testing "Field can-query? delegates to parent table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Field {field-id :id} {:table_id table-id :name "test_field" :base_type :type/Integer}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      ;; Grant both view-data and create-queries permissions to the table
      (data-perms/set-table-permission! pg table-id :perms/view-data :unrestricted)
      (data-perms/set-table-permission! pg table-id :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (is (true? (mi/can-query? (t2/select-one :model/Field field-id))))))))

;;; ---------------------------------- effective_type invariant guard tests -----------------------------------
;;; GHY-3388: a Field with coercion_strategy=nil and effective_type ≠ base_type is internally
;;; inconsistent — there's no coercion to justify the divergence. The model guard normalizes
;;; effective_type to base_type on insert and update so this state cannot be written by any
;;; caller (sync, API, serdes import, manual writes).

(deftest effective-type-guard-on-insert-test
  (testing "GHY-3388: inserting a field with effective_type ≠ base_type and no coercion_strategy
           gets normalized: effective_type is forced to match base_type"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}]
      (let [field-id (first (t2/insert-returning-pks!
                             :model/Field
                             {:table_id          table-id
                              :name              "broken_on_insert"
                              :display_name      "broken_on_insert"
                              :database_type     "NUMBER"
                              :base_type         :type/Number
                              :effective_type    :type/Text
                              :coercion_strategy nil
                              :position          0
                              :database_position 0}))]
        (is (=? {:base_type      :type/Number
                 :effective_type :type/Number}
                (t2/select-one :model/Field :id field-id)))))))

(deftest effective-type-guard-on-update-test
  (testing "GHY-3388: updating a field to set effective_type ≠ base_type with no coercion_strategy
           gets normalized; effective_type is forced to match base_type"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Field {field-id :id} {:table_id table-id
                                                :name "broken_on_update"
                                                :base_type :type/Number
                                                :effective_type :type/Number}]
      (t2/update! :model/Field field-id {:effective_type    :type/Text
                                         :coercion_strategy nil})
      (is (=? {:base_type      :type/Number
               :effective_type :type/Number}
              (t2/select-one :model/Field :id field-id))))))

(deftest effective-type-guard-preserves-legitimate-coercion-test
  (testing "GHY-3388: a field with a real coercion_strategy keeps its custom effective_type — the
           guard only fires when coercion_strategy is nil"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Field {field-id :id} {:table_id table-id
                                                :name "with_coercion"
                                                :base_type :type/Text
                                                :effective_type :type/Text}]
      (t2/update! :model/Field field-id {:effective_type    :type/Number
                                         :coercion_strategy :Coercion/String->Number})
      (is (=? {:base_type         :type/Text
               :effective_type    :type/Number
               :coercion_strategy :Coercion/String->Number}
              (t2/select-one :model/Field :id field-id))))))

(deftest effective-type-guard-clearing-coercion-resets-effective-type-test
  (testing "GHY-3388: clearing coercion_strategy without explicitly setting effective_type to
           match base_type still results in a consistent row — the guard normalizes effective_type"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Field {field-id :id} {:table_id          table-id
                                                :name              "clearing_coercion"
                                                :base_type         :type/Text
                                                :effective_type    :type/Number
                                                :coercion_strategy :Coercion/String->Number}]
      ;; user clears the coercion but doesn't reset effective_type — guard catches this
      (t2/update! :model/Field field-id {:coercion_strategy nil})
      (is (=? {:base_type         :type/Text
               :effective_type    :type/Text
               :coercion_strategy nil}
              (t2/select-one :model/Field :id field-id))))))

(defn- assert-coercion-effective-type-invariant!
  "Reads the field row and asserts the GHY-3388 invariant:
   coercion_strategy is nil ⇒ effective_type = base_type."
  [field-id label]
  (let [{:keys [base_type effective_type coercion_strategy]} (t2/select-one :model/Field :id field-id)]
    (when (nil? coercion_strategy)
      (is (= base_type effective_type)
          (format "GHY-3388 invariant violated after %s: base_type=%s effective_type=%s coercion_strategy=nil"
                  label (pr-str base_type) (pr-str effective_type))))))

(deftest effective-type-invariant-battery-test
  (testing "GHY-3388 INVARIANT: for any field row, if coercion_strategy is nil then effective_type
           must equal base_type. This battery exercises every write path that could violate the
           invariant and asserts it holds afterward. Adding a new path that writes :effective_type
           or :coercion_strategy on :model/Field should add a case here."
    (doseq [[label op]
            [["t2/insert! with broken state (effective_type ≠ base_type, coercion_strategy nil)"
              (fn [table-id]
                (first (t2/insert-returning-pks!
                        :model/Field
                        {:table_id          table-id
                         :name              "ins_broken"
                         :display_name      "ins_broken"
                         :database_type     "NUMBER"
                         :base_type         :type/Number
                         :effective_type    :type/Text
                         :coercion_strategy nil
                         :position          0
                         :database_position 0})))]
             ["t2/insert! with effective_type only set (no coercion)"
              (fn [table-id]
                (first (t2/insert-returning-pks!
                        :model/Field
                        {:table_id          table-id
                         :name              "ins_eff_only"
                         :display_name      "ins_eff_only"
                         :database_type     "NUMBER"
                         :base_type         :type/Number
                         :effective_type    :type/Integer
                         :position          0
                         :database_position 0})))]
             ["t2/update! sets effective_type to differ from base_type without coercion"
              (fn [table-id]
                (let [id (first (t2/insert-returning-pks!
                                 :model/Field
                                 {:table_id          table-id
                                  :name              "upd_eff"
                                  :display_name      "upd_eff"
                                  :database_type     "NUMBER"
                                  :base_type         :type/Number
                                  :effective_type    :type/Number
                                  :position          0
                                  :database_position 0}))]
                  (t2/update! :model/Field id {:effective_type :type/Text})
                  id))]
             ["t2/update! clears coercion_strategy but leaves effective_type stale"
              (fn [table-id]
                (let [id (first (t2/insert-returning-pks!
                                 :model/Field
                                 {:table_id          table-id
                                  :name              "upd_clear_coerce"
                                  :display_name      "upd_clear_coerce"
                                  :database_type     "TEXT"
                                  :base_type         :type/Text
                                  :effective_type    :type/Number
                                  :coercion_strategy :Coercion/String->Number
                                  :position          0
                                  :database_position 0}))]
                  (t2/update! :model/Field id {:coercion_strategy nil})
                  id))]
             ["t2/update! changes base_type but leaves effective_type stale"
              (fn [table-id]
                (let [id (first (t2/insert-returning-pks!
                                 :model/Field
                                 {:table_id          table-id
                                  :name              "upd_base"
                                  :display_name      "upd_base"
                                  :database_type     "TEXT"
                                  :base_type         :type/Text
                                  :effective_type    :type/Text
                                  :position          0
                                  :database_position 0}))]
                  (t2/update! :model/Field id {:base_type :type/Number})
                  id))]
             ["t2/update! sets both effective_type AND coercion_strategy=nil to mismatched values"
              (fn [table-id]
                (let [id (first (t2/insert-returning-pks!
                                 :model/Field
                                 {:table_id          table-id
                                  :name              "upd_both"
                                  :display_name      "upd_both"
                                  :database_type     "NUMBER"
                                  :base_type         :type/Number
                                  :effective_type    :type/Number
                                  :position          0
                                  :database_position 0}))]
                  (t2/update! :model/Field id {:effective_type    :type/Text
                                               :coercion_strategy nil})
                  id))]]]
      (testing label
        (mt/with-temp [:model/Database {db-id :id} {}
                       :model/Table {table-id :id} {:db_id db-id}]
          (let [field-id (op table-id)]
            (assert-coercion-effective-type-invariant! field-id label)))))))

(deftest data-sensitivity-transform-round-trip-test
  (testing "data_sensitivity is stored as the enum string and read back as a keyword"
    (mt/with-temp [:model/Field {field-id :id} {:data_sensitivity :PII}]
      (is (= "PII" (t2/select-one-fn :data_sensitivity :metabase_field :id field-id)))
      (is (= :PII (t2/select-one-fn :data_sensitivity :model/Field :id field-id)))))
  (testing "a field with no label reads nil and has no user-settings row"
    (mt/with-temp [:model/Field {field-id :id}]
      (is (nil? (t2/select-one-fn :data_sensitivity :model/Field :id field-id)))
      (is (not (t2/exists? :model/FieldUserSettings :field_id field-id))))))

(deftest data-sensitivity-user-setting-test
  (testing "a user-set label lives in the user settings and does not touch the Field"
    (mt/with-temp [:model/Field {field-id :id :as field} {:data_sensitivity :PII}]
      (field-user-settings/upsert-user-settings field {:data_sensitivity :PUBLIC})
      (is (= :PII (t2/select-one-fn :data_sensitivity :model/Field :id field-id)))
      (is (= :PUBLIC (t2/select-one-fn :data_sensitivity :model/FieldUserSettings :field_id field-id)))
      (is (= :PUBLIC (:data_sensitivity (warehouse-schema.db/field-with-user-settings field-id))))))
  (testing "a bare update to the Field is written as given and stays hidden behind the user label"
    (mt/with-temp [:model/Field {field-id :id :as field} {:data_sensitivity :PII}]
      (field-user-settings/upsert-user-settings field {:data_sensitivity :PUBLIC})
      (t2/update! :model/Field field-id {:data_sensitivity :PHI})
      (is (= :PHI (t2/select-one-fn :data_sensitivity :model/Field :id field-id)))
      (is (= :PUBLIC (:data_sensitivity (warehouse-schema.db/field-with-user-settings field-id))))))
  (testing "upsert-user-settings with a nil value clears a previously set label on the mirror"
    (mt/with-temp [:model/Field {field-id :id :as field} {:data_sensitivity :PII}]
      (field-user-settings/upsert-user-settings field {:data_sensitivity :PUBLIC})
      (field-user-settings/upsert-user-settings field {:data_sensitivity nil})
      (is (nil? (t2/select-one-fn :data_sensitivity :model/FieldUserSettings :field_id field-id)))
      (is (= :PII (:data_sensitivity (warehouse-schema.db/field-with-user-settings field-id)))))))

(deftest fields-with-user-settings-select-test
  (mt/with-temp [:model/Field {edited-id :id :as edited} {:display_name      "Sync Name"
                                                          :description       "sync description"
                                                          :semantic_type     :type/Category
                                                          :base_type         :type/Text
                                                          :effective_type    :type/Text
                                                          :coercion_strategy nil}
                 :model/Field {plain-id :id} {:display_name "Plain"}]
    (field-user-settings/upsert-user-settings edited {:display_name "User Name" :description nil :semantic_type nil})
    (testing "the sync row is untouched"
      (is (=? {:display_name "Sync Name" :description "sync description" :semantic_type :type/Category}
              (t2/select-one :model/Field :id edited-id))))
    (testing "user values, a user NULL included, replace the sync ones; the rest of the row and its transforms are intact"
      (is (=? {:id edited-id :display_name "User Name" :description nil :semantic_type nil :base_type :type/Text
               :effective_type :type/Text :coercion_strategy nil :visibility_type :normal}
              (warehouse-schema.db/field-with-user-settings edited-id)))
      (is (=? {:id plain-id :display_name "Plain"} (warehouse-schema.db/field-with-user-settings plain-id))))
    (testing "a flag left false means the sync value shows, even next to a user value"
      (t2/update! :model/FieldUserSettings edited-id {:description_set false})
      (is (= "sync description" (:description (warehouse-schema.db/field-with-user-settings edited-id)))))
    (testing "coercion_strategy follows the user's effective_type, so a cleared coercion shows as cleared"
      (t2/update! :model/Field edited-id {:effective_type :type/Number :coercion_strategy :Coercion/String->Number})
      (field-user-settings/upsert-user-settings edited {:effective_type :type/Text :coercion_strategy nil})
      (is (=? {:effective_type :type/Text :coercion_strategy nil} (warehouse-schema.db/field-with-user-settings edited-id)))
      (field-user-settings/unset-user-settings! edited [:effective_type :coercion_strategy])
      (is (=? {:effective_type :type/Number :coercion_strategy :Coercion/String->Number} (warehouse-schema.db/field-with-user-settings edited-id))))))

(deftest fields-with-user-settings-batches-test
  (testing "ids beyond one IN list's worth are queried in batches, all of them returned"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {a :id} {:table_id table-id :display_name "A" :position 0}
                   :model/Field {b :id :as field-b} {:table_id table-id :display_name "B" :position 1}
                   :model/Field {c :id} {:table_id table-id :display_name "C" :position 2}]
      (field-user-settings/upsert-user-settings field-b {:display_name "User B"})
      (with-redefs [warehouse-schema.db/field-id-batch-size 2]
        (is (= #{["A" a] ["User B" b] ["C" c]}
               (into #{} (map (juxt :display_name :id))
                     (warehouse-schema.db/fields-with-user-settings {:field-ids #{a b c}}))))
        (is (= [a b c]
               (map :id (warehouse-schema.db/fields-with-user-settings {:table-ids #{table-id}}))))))))

(deftest upsert-user-settings-flags-test
  (mt/with-temp [:model/Field {field-id :id :as field} {}
                 :model/Field {target-id :id} {}]
    (testing "only the flagged columns present in the settings are flagged"
      (field-user-settings/upsert-user-settings field {:display_name "X" :semantic_type :type/FK :fk_target_field_id target-id})
      (is (=? {:display_name "X" :semantic_type :type/FK :fk_target_field_id target-id
               :description_set false :semantic_type_set true :fk_target_field_id_set true}
              (t2/select-one :model/FieldUserSettings :field_id field-id))))
    (testing "an explicit nil is recorded and flagged as set"
      (field-user-settings/upsert-user-settings field {:description nil})
      (is (=? {:description nil :description_set true :semantic_type_set true}
              (t2/select-one :model/FieldUserSettings :field_id field-id))))
    (testing "unset-user-settings! drops the values and their flags"
      (field-user-settings/unset-user-settings! field [:semantic_type :fk_target_field_id :display_name])
      (is (=? {:display_name nil :semantic_type nil :fk_target_field_id nil
               :description_set true :semantic_type_set false :fk_target_field_id_set false}
              (t2/select-one :model/FieldUserSettings :field_id field-id))))
    (testing "keys outside the user-settable set are ignored"
      (field-user-settings/upsert-user-settings field {:name "nope" :position 3})
      (is (nil? (:name (t2/select-one :model/FieldUserSettings :field_id field-id)))))))

(deftest field-user-settings-column-test
  (testing "the Honey SQL helpers render per column kind"
    (is (= [[:metabase_field_user_settings :u] [:= :u.field_id :f.id]]
           (warehouse-schema/field-user-settings-join :f :u)))
    (is (= [:coalesce :u.display_name :f.display_name]
           (warehouse-schema/field-user-settings-column :display_name :f :u)))
    (is (= [:case [:= :u.description_set true] :u.description :else :f.description]
           (warehouse-schema/field-user-settings-column :description :f :u)))
    (is (= [:case [:not= :u.effective_type nil] :u.coercion_strategy :else :f.coercion_strategy]
           (warehouse-schema/field-user-settings-column :coercion_strategy :f :u))))
  (testing "they read the user values on the app DB"
    (mt/with-temp [:model/Field {field-id :id :as field} {:display_name "Sync" :description "sync" :semantic_type :type/Category}]
      (field-user-settings/upsert-user-settings field {:display_name "User" :description nil})
      (is (= [{:display_name "User" :description nil :semantic_type "type/Category"}]
             (t2/query {:select    [[(warehouse-schema/field-user-settings-column :display_name :f :u) :display_name]
                                    [(warehouse-schema/field-user-settings-column :description :f :u) :description]
                                    [(warehouse-schema/field-user-settings-column :semantic_type :f :u) :semantic_type]]
                        :from      [[:metabase_field :f]]
                        :left-join (warehouse-schema/field-user-settings-join :f :u)
                        :where     [:= :f.id field-id]}))))))

(deftest deactivating-fk-target-unsets-user-fk-test
  (testing "retiring a Field drops the user-set FKs pointing at it so the sync values show again"
    (mt/with-temp [:model/Field {target-id :id} {}
                   :model/Field {source-id :id :as source} {:semantic_type :type/Category}]
      (field-user-settings/upsert-user-settings source {:semantic_type :type/FK :fk_target_field_id target-id})
      (t2/update! :model/Field target-id {:active false})
      (is (=? {:semantic_type nil :semantic_type_set false :fk_target_field_id nil :fk_target_field_id_set false}
              (t2/select-one :model/FieldUserSettings :field_id source-id)))
      (is (= :type/Category (:semantic_type (warehouse-schema.db/field-with-user-settings source-id)))))))
