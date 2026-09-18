(ns metabase.permissions.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.db :as permissions.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest field-visibility-info-honors-user-set-visibility-type-test
  (testing "field-visibility-info honors a user-set visibility_type (e.g. sensitive) over the sync value"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id, :visibility_type "normal"}]
      (testing "sanity check: the sync value shows by default"
        (is (=? {:id field-id, :visibility_type :normal, :table_id table-id}
                (first (permissions.db/field-visibility-info #{field-id})))))
      (mt/with-temp [:model/FieldUserSettings _ {:field_id field-id, :visibility_type :sensitive}]
        (is (=? {:id field-id, :visibility_type :sensitive, :table_id table-id}
                (first (permissions.db/field-visibility-info #{field-id}))))))))

;;; ------------------------------------------------ Value binding ------------------------------------------------
;;;
;;; The values `metabase.permissions.db` filters on are bound as SQL parameters rather than compiled into the
;;; statement, so a value shaped like SQL is matched as text and matches nothing.

(def ^:private sql-injection-attempt
  "A value shaped like SQL. Bound as a parameter it matches nothing; compiled into the statement it would change
  the query."
  "x' OR '1'='1")

(deftest ^:parallel magic-group-lookups-bind-their-value-test
  (mt/with-temp [:model/PermissionsGroup _ {}]
    (testing "a magic group type that looks like SQL matches no group"
      (is (nil? (permissions.db/magic-group sql-injection-attempt)))
      (is (nil? (permissions.db/group-by-magic-type sql-injection-attempt)))
      (is (nil? (permissions.db/group-id-by-magic-type sql-injection-attempt))))))

(deftest ^:parallel group-exists-with-lower-name?-binds-its-value-test
  (mt/with-temp [:model/PermissionsGroup _ {}]
    (testing "a group name that looks like SQL matches no group"
      (is (false? (permissions.db/group-exists-with-lower-name? sql-injection-attempt))))))

(deftest ^:parallel group-names-like-binds-its-pattern-test
  (mt/with-temp [:model/PermissionsGroup _ {}]
    (testing "a LIKE pattern that looks like SQL matches no group"
      (is (empty? (permissions.db/group-names-like sql-injection-attempt))))))

(deftest ^:parallel group-ids-with-permission-objects-binds-its-values-test
  (mt/with-temp [:model/PermissionsGroup _ {}]
    (testing "a permission object that looks like SQL matches no group"
      (is (empty? (permissions.db/group-ids-with-permission-objects [sql-injection-attempt]))))))

(deftest ^:parallel related-permission-objects-binds-its-patterns-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (testing "a path that looks like SQL matches no permission object"
      (is (empty? (permissions.db/related-permission-objects group-id sql-injection-attempt [])))
      (is (empty? (permissions.db/related-permission-objects group-id "/db/1/" [sql-injection-attempt]))))))

(deftest ^:parallel perm-type-lookups-bind-their-value-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (testing "a permission type that looks like SQL matches no row"
      (is (nil? (permissions.db/database-level-permission sql-injection-attempt group-id (mt/id))))
      (is (empty? (permissions.db/table-permission-values-for-groups #{group-id}
                                                                     sql-injection-attempt
                                                                     (mt/id)
                                                                     nil)))
      (is (empty? (permissions.db/database-level-permissions (mt/id) [group-id] [sql-injection-attempt])))
      (is (empty? (permissions.db/table-permission-ids sql-injection-attempt group-id #{1}))))))

(deftest ^:parallel schema-permission-rank-pair-binds-its-values-test
  (mt/with-temp [:model/PermissionsGroup _ {}]
    (testing "a perm type and schema name that look like SQL match no row"
      (is (nil? (:mn (permissions.db/schema-permission-rank-pair (mt/user->id :rasta)
                                                                 sql-injection-attempt
                                                                 (mt/id)
                                                                 sql-injection-attempt)))))))

(deftest update-users!-filters-on-the-ids-it-is-given
  (testing "only the users named in `user-ids` are updated"
    (mt/with-temp [:model/User {a :id} {:is_data_analyst false}
                   :model/User {b :id} {:is_data_analyst false}]
      (is (= 1 (permissions.db/update-users! [a] {:is_data_analyst true})))
      (is (true? (t2/select-one-fn :is_data_analyst :model/User :id a)))
      (is (false? (t2/select-one-fn :is_data_analyst :model/User :id b))))))

(deftest ^:parallel collection-graph-rows-binds-its-admin-group-id-test
  (testing "the admin group id is selected as a bound value on the implicit-admin rows"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                   :model/Collection {collection-id :id} {}]
      (let [admin-rows (fn [admin-group-id]
                         (->> (permissions.db/collection-graph-rows
                               nil true "/collection/root/" [collection-id] [group-id] admin-group-id)
                              (into [] (comp (filter (fn [row] (= collection-id (:collection_id row))))
                                             (map :group_id)))
                              set))]
        (is (contains? (admin-rows group-id) group-id))
        (is (contains? (admin-rows nil) nil))))))
