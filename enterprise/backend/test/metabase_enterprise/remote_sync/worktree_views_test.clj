(ns metabase-enterprise.remote-sync.worktree-views-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.write :as remote-sync.write]
   [metabase.app-db.core :as mdb]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [toucan2.core :as t2]))

(defmacro ^:private in-worktree
  "Runs `body` in the worktree with `worktree-id`."
  [worktree-id & body]
  `(mdb/with-worktree-scope {:type :worktree :worktree-id ~worktree-id} ~@body))

(defn- columns
  "The columns of the row with `id` in the app DB `table`."
  [table id]
  (set (keys (t2/query-one {:select [:*] :from [table] :where [:= :id id]}))))

(deftest views-have-table-columns-test
  (testing "each worktree view has exactly the columns of its stored table"
    (is (= (columns :metabase_table (mt/id :venues)) (columns :v_worktree_table (mt/id :venues))))
    (is (= (columns :metabase_field (mt/id :venues :name)) (columns :v_worktree_field (mt/id :venues :name))))))

(defn- do-with-worktree-table-and-field!
  "Runs `f` with a new worktree's id, Table and Field, created outside a transaction so that worktree queries check out
  their own connections."
  [f]
  (mt/with-model-cleanup [:model/Table]
    (let [worktree-id (:id (remote-sync.write/create-worktree! {:branch "worktree-test"}))
          table-id    (t2/insert-returning-pk! :model/Table {:name "worktree_table" :display_name "Sync Table"
                                                             :db_id (mt/id) :active true})
          field-id    (t2/insert-returning-pk! :model/Field {:table_id table-id :name "f" :display_name "Sync Field"
                                                             :base_type :type/Text :database_type "TEXT"})]
      (try
        (f worktree-id (t2/select-one :model/Table :id table-id) (t2/select-one :model/Field :id field-id))
        (finally
          (remote-sync.write/delete-worktree! worktree-id))))))

(deftest worktree-reads-settings-test
  (when (= (mdb/db-type) :postgres)
    (do-with-worktree-table-and-field!
     (fn [worktree-id {table-id :id :as table} {field-id :id :as field}]
       (in-worktree worktree-id
                    (table-user-settings/upsert-table-user-settings! table {:display_name "Worktree Table"})
                    (field-user-settings/upsert-field-user-settings! field {:display_name "Worktree Field"}))
       (testing "a worktree reads its user settings from every query of the stored tables"
         (in-worktree worktree-id
                      (is (= "Worktree Table" (t2/select-one-fn :display_name :model/Table :id table-id)))
                      (is (= 1 (t2/count :model/Field :table_id table-id :display_name "Worktree Field")))
                      (is (= ["Worktree Table"]
                             (t2/select-fn-vec :display_name :model/Table
                                               {:select [:t.*]
                                                :from   [[:metabase_table :t]]
                                                :join   [[:metabase_field :f] [:= :f.table_id :t.id]]
                                                :where  [:= :f.display_name "Worktree Field"]})))
                      (is (= [{:display_name "Worktree Table"}]
                             (mdb/query {:select [:display_name] :from [:metabase_table] :where [:= :id table-id]})))
                      (is (= {:display_name "Worktree Field"}
                             (t2/query-one ["SELECT display_name FROM metabase_field WHERE id = ?" field-id])))
                      (is (= "Worktree Field"
                             (:display-name (lib.metadata/field (lib-be/application-database-metadata-provider (mt/id))
                                                                field-id))))))
       (testing "main reads the stored rows"
         (is (= "Sync Table" (t2/select-one-fn :display_name :model/Table :id table-id)))
         (is (= "Sync Field" (t2/select-one-fn :display_name :model/Field :id field-id))))))))

(deftest worktree-writes-fail-test
  (when (= (mdb/db-type) :postgres)
    (testing "a worktree cannot write Tables or Fields"
      (do-with-worktree-table-and-field!
       (fn [worktree-id {table-id :id} {field-id :id}]
         (in-worktree worktree-id
                      (is (thrown? Exception (t2/update! :model/Table :id table-id {:description "Updated"})))
                      (is (thrown? Exception (t2/insert! :model/Field {:table_id table-id :name "g" :base_type :type/Text
                                                                       :database_type "TEXT"})))
                      (is (thrown? Exception (t2/delete! :model/Field :id field-id))))
         (is (nil? (t2/select-one-fn :description :model/Table :id table-id)))
         (is (= [field-id] (t2/select-pks-vec :model/Field :table_id table-id))))))))

(deftest worktree-sync-writes-stored-tables-test
  (when (= (mdb/db-type) :postgres)
    (testing "sync called in a worktree records the warehouse in the stored Tables"
      (do-with-worktree-table-and-field!
       (fn [worktree-id {table-id :id} _field]
         (in-worktree worktree-id
                      (sync/deactivate-table! table-id))
         (is (false? (t2/select-one-fn :active :model/Table :id table-id))))))))
