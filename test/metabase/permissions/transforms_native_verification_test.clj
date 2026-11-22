(ns metabase.permissions.transforms-native-verification-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- row
  [group-id db-id perm-type perm-value]
  {:group_id group-id :db_id db-id :perm_type perm-type :perm_value perm-value})

(defn- database-level
  "The `#{[group-id db-id perm-type perm-value]}` of the database-level create-queries and transforms rows stored now."
  [group-ids db-ids]
  (t2/select-fn-set (juxt :group_id :db_id :perm_type :perm_value) :model/DataPermissions
                    :group_id [:in group-ids] :db_id [:in db-ids] :table_id nil
                    :perm_type [:in ["perms/create-queries" "perms/transforms"]]))

(defn- old-refusal?
  "Whether the check `create-data-permissions!` ran before each of its batches refused `rows`, from the rows stored
  now: the create-queries rows were inserted first, each checked against the stored transforms permission, then the
  transforms rows, each checked against the stored and just inserted native query access."
  [rows]
  (let [group-ids (into #{} (map :group_id) rows)
        db-ids    (into #{} (map :db_id) rows)
        stored    (database-level group-ids db-ids)
        db-level? (fn [{:keys [table_id perm_type]}] (and (nil? table_id) (= :perms/create-queries perm_type)))
        others    (remove #(= :perms/transforms (:perm_type %)) rows)
        after     (into stored (comp (filter db-level?) (map (juxt :group_id :db_id :perm_type :perm_value))) others)]
    (boolean
     (or (some (fn [{:keys [group_id db_id perm_value] :as r}]
                 (and (db-level? r)
                      (not= :query-builder-and-native perm_value)
                      (contains? stored [group_id db_id :perms/transforms :yes])))
               others)
         (some (fn [{:keys [group_id db_id perm_type perm_value]}]
                 (and (= :perms/transforms perm_type)
                      (= :yes perm_value)
                      (not (contains? after [group_id db_id :perms/create-queries :query-builder-and-native]))))
               rows)))))

(defn- check-case
  [group-id db-id stored-rows rows]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (t2/delete! :model/DataPermissions :group_id group-id)
    (when (seq stored-rows)
      (t2/insert! :model/DataPermissions stored-rows))
    (let [expected (old-refusal? rows)
          stored   #(t2/select-fn-set (juxt :db_id :table_id :perm_type :perm_value) :model/DataPermissions
                                      :group_id group-id)
          before   (stored)
          refusal  (try
                     (data-perms/create-data-permissions! rows)
                     nil
                     (catch clojure.lang.ExceptionInfo e
                       (:status-code (ex-data e))))]
      (testing (pr-str {:stored stored-rows :written rows})
        (is (= (when expected 400) refusal))
        (when expected
          (is (= before (stored))))))))

(deftest create-data-permissions-refuses-exactly-what-the-pre-write-check-refused-test
  (mt/with-temp [:model/PermissionsGroup {g :id} {}
                 :model/Database         {d :id} {}
                 :model/Table            {t :id} {:db_id d}]
    (let [native     (row g d :perms/create-queries :query-builder-and-native)
          builder    (row g d :perms/create-queries :query-builder)
          no-queries (row g d :perms/create-queries :no)
          table-only (assoc (row g d :perms/create-queries :query-builder) :table_id t)
          yes        (row g d :perms/transforms :yes)
          no         (row g d :perms/transforms :no)
          stored     [[] [native] [builder] [yes] [no] [native yes] [builder no]]
          written    [[yes] [no] [native] [builder] [no-queries] [table-only]
                      [native yes] [builder yes] [no-queries yes] [table-only yes] [builder no]]]
      (doseq [stored-rows stored
              rows        written
              :let [stored-db-level (into #{} (map (juxt :perm_type :table_id)) stored-rows)]
              ;; the unique key allows one row per group, Database, type and Table: skip calls that duplicate one
              :when (not-any? #(contains? stored-db-level ((juxt :perm_type :table_id) %)) rows)]
        (check-case g d stored-rows rows)))))

(deftest refused-transforms-grant-does-not-survive-a-caller-transaction-test
  (mt/with-temp [:model/PermissionsGroup {g :id} {}
                 :model/Database         {d :id} {}
                 :model/Database         {other :id} {}]
    (t2/delete! :model/DataPermissions :group_id g)
    (t2/with-transaction [_conn]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Transforms permission requires"
                            (data-perms/create-data-permissions! [(row g d :perms/transforms :yes)])))
      (data-perms/create-data-permissions! [(row g other :perms/create-queries :query-builder-and-native)]))
    (testing "the caller caught the refusal and committed another write: the refused row is absent"
      (is (not (t2/exists? :model/DataPermissions :group_id g :db_id d :perm_type :perms/transforms)))
      (is (t2/exists? :model/DataPermissions :group_id g :db_id other :perm_type :perms/create-queries)))))
