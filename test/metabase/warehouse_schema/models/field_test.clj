(ns metabase.warehouse-schema.models.field-test
  "Tests for specific behavior related to the Field model."
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.util :as u]
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

(deftest identity-hash-test
  (testing "Field hashes are composed of the name, the table's identity-hash, and the parent's identity-hash"
    (mt/with-temp [:model/Database db    {:name "field-db" :engine :h2}
                   :model/Table    table {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                   :model/Field    field {:name "sku" :table_id (:id table)}]
      (let [table-hash (serdes/identity-hash table)]
        (is (= "edc06d97"
               (serdes/raw-hash ["sku" table-hash "<none>"])
               (serdes/identity-hash field)))))))

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

(deftest nested-fields-with-duplicate-names-test
  (mt/with-temp
    [:model/Database {db-id :id} {:name "field-db", :engine :h2}
     :model/Table    table       {:schema  "PUBLIC"
                                  :name    "widget"
                                  :db_id   db-id}
     :model/Field    parent1     {:name    "parent1"
                                  :table_id (:id table)}
     :model/Field    parent2     {:name    "parent2"
                                  :table_id (:id table)}
     ;; These two have the same name but different parents.
     :model/Field    child1      {:name      "child"
                                  :table_id  (:id table)
                                  :parent_id (:id parent1)}
     :model/Field    child2      {:name      "child"
                                  :table_id  (:id table)
                                  :parent_id (:id parent2)}]
    (testing "nested fields with the same name and different parents have unique identity-hashes"
      (is (= "204a7209"
             (serdes/raw-hash ["parent1" (serdes/identity-hash table) "<none>"])
             (serdes/identity-hash parent1)))
      (is (= "be1bb68e"
             (serdes/raw-hash ["parent2" (serdes/identity-hash table) "<none>"])
             (serdes/identity-hash parent2)))
      (is (= "7f203b41"
             (serdes/raw-hash ["child" (serdes/identity-hash table) (serdes/identity-hash parent1)])
             (serdes/identity-hash child1)))
      (is (= "913269d5"
             (serdes/raw-hash ["child" (serdes/identity-hash table) (serdes/identity-hash parent2)])
             (serdes/identity-hash child2))))))

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
                  id))]
             ["upsert-user-settings writes broken effective_type then any field update fires the merge-back overlay"
              (fn [table-id]
                (let [id (first (t2/insert-returning-pks!
                                 :model/Field
                                 {:table_id          table-id
                                  :name              "upsert_then_upd"
                                  :display_name      "upsert_then_upd"
                                  :database_type     "NUMBER"
                                  :base_type         :type/Number
                                  :effective_type    :type/Number
                                  :position          0
                                  :database_position 0}))]
                  ;; write a stale, no-coercion overlay into user-settings
                  (field-user-settings/upsert-user-settings
                   {:id id}
                   {:effective_type :type/Text :coercion_strategy nil})
                  ;; trigger before-update (which runs sync-user-settings overlay merge)
                  (t2/update! :model/Field id {:display_name "trigger merge"})
                  id))]]]
      (testing label
        (mt/with-temp [:model/Database {db-id :id} {}
                       :model/Table {table-id :id} {:db_id db-id}]
          (let [field-id (op table-id)]
            (assert-coercion-effective-type-invariant! field-id label)))))))
