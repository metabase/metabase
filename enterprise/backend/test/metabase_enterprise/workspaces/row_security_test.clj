(ns metabase-enterprise.workspaces.row-security-test
  "Row-level security on the app DB tables that hold the rows a workspace owns, and the setting that turns it on."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as serdes.tu]
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

(defn do-with-request-workspaces-enabled!
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

(defmacro with-request-workspaces-enabled!
  "Runs `body` with requests able to name a workspace; see [[do-with-request-workspaces-enabled!]]."
  [& body]
  `(do-with-request-workspaces-enabled! (fn [] ~@body)))

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
  (with-request-workspaces-enabled!
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
          (is (= ws-a (mdb/owner-workspace-id :metabase_table only-a))))
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

(deftest every-listing-shows-a-workspace-its-own-tables-test
  ;; no listing code knows about workspaces: row-level security gives each the right rows
  (with-request-workspaces-enabled!
    ((requiring-resolve 'metabase-enterprise.workspaces.request-workspace-test/do-with-request-workspace)
     (fn [{:keys [workspace-id db-id]}]
       (mt/with-temp [:model/Table {shared :id} {:db_id db-id :schema "public" :name "shared_orders" :active true}]
         (let [owned   (mdb/with-workspace-id workspace-id
                         (t2/insert-returning-pk! :model/Table {:db_id db-id :schema "public" :name "ws_only_orders"
                                                                :active true}))
               _       (mdb/with-workspace-id workspace-id
                         (t2/insert! :model/Field {:table_id owned :name "ws_only_total" :base_type :type/Integer
                                                   :database_type "int4"}))
               headers (fn [ws-id] {:request-options {:headers (cond-> {}
                                                                 ws-id (assoc "x-metabase-workspace-id"
                                                                              (str ws-id)))}})
               names   (fn [ws-id]
                         {:schema       (set (map :name (mt/user-http-request :crowberto :get 200
                                                                              (format "database/%d/schema/public" db-id)
                                                                              (headers ws-id))))
                          :metadata     (set (map :name (:tables (mt/user-http-request
                                                                  :crowberto :get 200
                                                                  (format "database/%d/metadata" db-id)
                                                                  (headers ws-id)))))
                          :tables       (set (keep #(when (= db-id (:db_id %)) (:name %))
                                                   (mt/user-http-request :crowberto :get 200 "table" (headers ws-id))))
                          :autocomplete (set (map first (mt/user-http-request
                                                         :crowberto :get 200
                                                         (format "database/%d/autocomplete_suggestions" db-id)
                                                         (headers ws-id) :prefix "ws_only")))})]
           (testing "a request in the workspace lists its own Table and Field everywhere"
             (is (= {:schema       #{"shared_orders" "ws_only_orders"}
                     :metadata     #{"shared_orders" "ws_only_orders"}
                     :tables       #{"shared_orders" "ws_only_orders"}
                     :autocomplete #{"ws_only_orders" "ws_only_total"}}
                    (names workspace-id))))
           (testing "a request in no workspace lists only the shared ones"
             (is (= {:schema       #{"shared_orders"}
                     :metadata     #{"shared_orders"}
                     :tables       #{"shared_orders"}
                     :autocomplete #{}}
                    (names nil))))
           (testing "so do lookups outside the REST API, such as the MCP and Metabot tools'"
             (let [mcp-tables     (requiring-resolve 'metabase.mcp.db/active-tables-by-ids)
                   metabot-tables (requiring-resolve 'metabase.metabot.db/active-tables-for-database)]
               (mdb/with-workspace-id workspace-id
                 (is (= #{"shared_orders" "ws_only_orders"} (set (map :name (mcp-tables [shared owned])))))
                 (is (= #{"shared_orders" "ws_only_orders"} (set (map :name (metabot-tables db-id))))))
               (is (= #{"shared_orders"} (set (map :name (mcp-tables [shared owned])))))
               (is (= #{"shared_orders"} (set (map :name (metabot-tables db-id)))))))))))))

(deftest a-selected-table-or-field-has-no-workspace-id-test
  (testing "the workspace that owns a row is the app DB's business: a selected Table or Field does not have it, so no
            API response or serdes export does"
    (is (not (contains? (t2/select-one :model/Table :id (mt/id :venues)) :workspace_id)))
    (is (not (contains? (t2/select-one :model/Field :id (mt/id :venues :price)) :workspace_id)))))

(deftest the-owner-of-a-row-stays-out-of-responses-and-exports-test
  (with-request-workspaces-enabled!
    ((requiring-resolve 'metabase-enterprise.workspaces.request-workspace-test/do-with-request-workspace)
     (fn [{:keys [workspace-id db-id]}]
       (mt/with-temp [:model/Table {shared :id} {:db_id db-id :schema "public" :name "shared_orders" :active true}]
         (let [owned       (mdb/with-workspace-id workspace-id
                             (t2/insert-returning-pk! :model/Table {:db_id db-id :schema "public"
                                                                    :name "ws_only_orders" :active true}))
               owned-field (mdb/with-workspace-id workspace-id
                             (t2/insert-returning-pk! :model/Field {:table_id owned :name "ws_only_total"
                                                                    :base_type :type/Integer :database_type "int4"}))
               headers     {:request-options {:headers {"x-metabase-workspace-id" (str workspace-id)}}}
               get         (fn [path] (mt/user-http-request :crowberto :get 200 path headers))]
           (testing "the API"
             (is (not (contains? (get (format "table/%d" owned)) :workspace_id)))
             (let [metadata (get (format "table/%d/query_metadata" owned))]
               (is (not (contains? metadata :workspace_id)))
               (is (= ["ws_only_total"] (map :name (:fields metadata))))
               (is (not-any? #(contains? % :workspace_id) (:fields metadata))))
             (is (not-any? #(contains? % :workspace_id)
                           (mapcat #(cons % (:fields %)) (:tables (get (format "database/%d/metadata" db-id)))))))
           (testing "serdes exports"
             (mdb/with-workspace-id workspace-id
               (is (not (contains? (serdes.tu/extract-one "Table" owned)
                                   :workspace_id)))
               (is (not (contains? (serdes.tu/extract-one "Field" owned-field)
                                   :workspace_id)))))
           (testing "code that needs the owner of a row asks the app DB"
             (mdb/with-workspace-id workspace-id
               (is (= workspace-id (mdb/owner-workspace-id :metabase_table owned)))
               (is (= workspace-id (mdb/owner-workspace-id :metabase_field owned-field)))
               (is (nil? (mdb/owner-workspace-id :metabase_table shared))))
             (testing "from any thread: work on a row, such as a sync, may leave the workspace before it asks"
               (is (= workspace-id (mdb/owner-workspace-id :metabase_table owned)))))))))))
