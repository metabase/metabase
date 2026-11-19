(ns metabase-enterprise.workspaces.row-security-test
  "Row-level security on the app DB tables that hold the rows a workspace owns, and the setting that turns it on."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- row-security []
  (into {}
        (map (juxt :relname (juxt :relrowsecurity :relforcerowsecurity)))
        (t2/query ["SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
                    WHERE relname IN ('metabase_table', 'metabase_field') AND relkind = 'r'"])))

(defn row-security-applies?
  "Whether the app DB can keep the rows of workspaces apart: Postgres, with a role that row-level security applies to."
  []
  (and (= :postgres (mdb/db-type))
       (not (ws.db/row-security-bypassed?))))

(defn do-with-request-workspaces-enabled
  "Calls `thunk` with [[ws.settings/request-workspaces-enabled]] on, and turns it off after, when the app DB can keep the
  rows of workspaces apart ([[row-security-applies?]]). Otherwise does not call `thunk`: a request can't name a
  workspace there."
  [thunk]
  (when (row-security-applies?)
    (try
      (ws.settings/request-workspaces-enabled! true)
      (thunk)
      (finally
        (ws.settings/request-workspaces-enabled! false)))))

(defmacro with-request-workspaces-enabled
  "Runs `body` with requests able to name a workspace; see [[do-with-request-workspaces-enabled]]."
  [& body]
  `(do-with-request-workspaces-enabled (fn [] ~@body)))

(deftest request-workspaces-enabled-test
  (if-not (row-security-applies?)
    (testing "an app DB that can't keep the rows of workspaces apart refuses the setting"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"PostgreSQL application database|superuser"
                            (ws.settings/request-workspaces-enabled! true))))
    (try
      (testing "the setting turns row-level security on, forced for the table owner"
        (ws.settings/request-workspaces-enabled! true)
        (is (true? (ws.settings/request-workspaces-enabled)))
        (is (= {"metabase_table" [true true] "metabase_field" [true true]} (row-security))))
      (testing "it can't turn off while a workspace owns a Table: that Table would show to every connection"
        (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws"}
                       :model/Database  {db-id :id} {}]
          (mdb/with-workspace-id ws-id
            (t2/insert! :model/Table {:db_id db-id :name "only_ws" :active true}))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"own Tables or Fields"
                                (ws.settings/request-workspaces-enabled! false)))
          (is (true? (ws.settings/request-workspaces-enabled)))))
      (testing "turning it off turns row-level security off"
        (ws.settings/request-workspaces-enabled! false)
        (is (false? (ws.settings/request-workspaces-enabled)))
        (is (= {"metabase_table" [false false] "metabase_field" [false false]} (row-security))))
      (finally
        (ws.settings/request-workspaces-enabled! false)))))

(defn- table-names [db-id]
  (t2/select-fn-set :name :model/Table :db_id db-id))

(deftest each-workspace-sees-the-shared-rows-and-its-own-test
  (with-request-workspaces-enabled
    (mt/with-temp [:model/Database  {db-id :id} {}
                   :model/Workspace {ws-a :id}  {:name "a"}
                   :model/Workspace {ws-b :id}  {:name "b"}
                   :model/Table     {shared :id} {:db_id db-id :name "shared" :active true}]
      (let [only-a (mdb/with-workspace-id ws-a
                     (t2/insert-returning-pk! :model/Table {:db_id db-id :name "only_a" :active true}))]
        (mdb/with-workspace-id ws-a
          (t2/insert! :model/Field {:table_id shared :name "added_by_a" :base_type :type/Integer
                                    :database_type "int4"}))
        (testing "a Table or Field inserted in a workspace belongs to it"
          (is (= ws-a (mdb/with-workspace-id :all (t2/select-one-fn :workspace_id :model/Table :id only-a)))))
        (testing "no workspace sees only the shared rows"
          (is (= #{"shared"} (table-names db-id)))
          (is (empty? (t2/select :model/Field :table_id shared))))
        (testing "a workspace sees the shared rows and its own"
          (mdb/with-workspace-id ws-a
            (is (= #{"shared" "only_a"} (table-names db-id)))
            (is (= #{"added_by_a"} (t2/select-fn-set :name :model/Field :table_id shared)))))
        (testing "another workspace does not see them"
          (mdb/with-workspace-id ws-b
            (is (= #{"shared"} (table-names db-id)))
            (is (empty? (t2/select :model/Field :table_id shared)))))
        (testing "a workspace can't write a row into another workspace"
          (mdb/with-workspace-id ws-b
            ;; in a nested transaction: the refusal aborts the transaction it runs in
            (is (thrown-with-msg? Exception #"row-level security"
                                  (t2/with-transaction [_conn]
                                    (t2/insert! :model/Table {:db_id db-id :name "sneaky" :active true
                                                              :workspace_id ws-a}))))))
        (testing "a hide row hides a shared Table from a workspace only"
          (t2/insert! :model/WorkspaceTableCopy {:workspace_id ws-a :table_id shared :active false})
          (mdb/with-workspace-id ws-a
            (is (= #{"only_a"} (table-names db-id))))
          (is (= #{"shared"} (table-names db-id))))
        (testing "a workspace's rows go with it"
          (t2/delete! :model/Workspace :id ws-a)
          (is (= #{"shared"} (mdb/with-workspace-id :all (table-names db-id))))
          (is (empty? (mdb/with-workspace-id :all (t2/select :model/Field :table_id shared)))))))))
