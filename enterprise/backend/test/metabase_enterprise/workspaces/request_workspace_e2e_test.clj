(ns ^:mb/driver-tests metabase-enterprise.workspaces.request-workspace-e2e-test
  "End-to-end test of requests that name a workspace of this instance with the `X-Metabase-Workspace-Id` header,
  against a real Postgres warehouse.

  Provisions two workspaces of one Database, runs the same transform through the API in each, and checks that a
  request in each workspace reads its own output, and a request in no workspace reads the canonical table."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.driver.postgres :as postgres]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- provision-workspace-database!
  "Insert a WorkspaceDatabase of `workspace-id` for `database-id`, reading `input-schemas`, and provision it."
  [workspace-id database-id input-schemas]
  (let [wsd-id (t2/insert-returning-pk! :model/WorkspaceDatabase
                                        {:workspace_id     workspace-id
                                         :database_id      database-id
                                         :input_schemas    input-schemas
                                         :database_details {}
                                         :output_namespace ""})]
    (mt/with-dynamic-fn-redefs [postgres/check-no-public-create-anywhere! (constantly nil)]
      (provisioning/provision-single! wsd-id))
    (t2/select-one :model/WorkspaceDatabase :id wsd-id)))

(defn- headers
  "The request options of a request in the workspace with `workspace-id`, or in none when it is nil."
  [workspace-id]
  {:request-options {:headers (cond-> {}
                                workspace-id (assoc "x-metabase-workspace-id" (str workspace-id)))}})

(defn- run-query
  "The rows of running the MBQL or native `query` through `POST /api/dataset` in the workspace with `workspace-id`, or
  in none, sorted."
  [workspace-id query]
  (->> (mt/user-http-request :crowberto :post 202 "dataset" (headers workspace-id) query)
       mt/rows
       (map vec)
       sort
       vec))

(defn- run-transform!
  "Run the Transform with `transform-id` through the API in the workspace with `workspace-id`, and wait for the run."
  [workspace-id transform-id]
  (let [{:keys [run_id]} (mt/user-http-request :crowberto :post 202 (format "transform/%d/run" transform-id)
                                               (headers workspace-id))
        deadline         (+ (System/currentTimeMillis) 60000)]
    (loop []
      (let [{:keys [status message]} (t2/select-one :model/TransformRun :id run_id)]
        (cond
          (= :succeeded status)                       nil
          (#{:failed :cancelled :timeout} status)     (throw (ex-info (str "Transform run " (name status) ": " message) {}))
          (> (System/currentTimeMillis) deadline)     (throw (ex-info "Transform run timed out" {}))
          :else                                       (do (Thread/sleep 200) (recur)))))))

(defn- do-with-two-workspaces!
  "Calls `f` with a map of the setup, in `mt/with-db` of a Database on the Postgres test warehouse that the instance
  synced: a canonical schema with a source table `src-name` holding `(1, a) (2, b)`, an output table `out-name`
  holding `(99, pre-existing)`, and two provisioned workspaces of the Database."
  [f]
  (mt/test-driver :postgres
    (mt/with-premium-features #{:workspaces :transforms-basic :hosting}
      (let [admin-details (:details (mt/db))
            admin-spec    (sql-jdbc.conn/connection-details->spec :postgres admin-details)
            run-id        (subs (str (random-uuid)) 0 8)
            main-schema   (str "canonical_schema_" run-id)
            src-name      (str "x_input_table_" run-id)
            out-name      (str "x_output_table_" run-id)
            exec!         #(jdbc/execute! admin-spec [%])]
        (try
          (exec! (format "CREATE SCHEMA \"%s\"" main-schema))
          (exec! (format "CREATE TABLE \"%s\".\"%s\" (id integer, v text)" main-schema src-name))
          (exec! (format "INSERT INTO \"%s\".\"%s\" VALUES (1, 'a'), (2, 'b')" main-schema src-name))
          (exec! (format "CREATE TABLE \"%s\".\"%s\" (id integer, v text)" main-schema out-name))
          (exec! (format "INSERT INTO \"%s\".\"%s\" VALUES (99, 'pre-existing')" main-schema out-name))
          (mt/with-temp [:model/Database ws-db {:engine :postgres :details admin-details :name (str "ws-e2e-" run-id)}]
            (let [workspaces (vec (for [n ["a" "b"]]
                                    (let [{ws-id :id} (ws/create-workspace! {:name       (str "ws-e2e-" run-id "-" n)
                                                                             :creator_id (mt/user->id :crowberto)})]
                                      (assoc (provision-workspace-database! ws-id (:id ws-db) [main-schema])
                                             :workspace-id ws-id))))]
              (try
                (is (= [:provisioned :provisioned] (map :status workspaces)))
                (mt/with-db ws-db
                  (sync/sync-database! (:id ws-db) {:scan :schema})
                  (f {:admin-details admin-details
                      :admin-spec    admin-spec
                      :main-schema   main-schema
                      :src-name      src-name
                      :out-name      out-name
                      :ws-db         ws-db
                      :workspaces    workspaces
                      :table         #(t2/select-one :model/Table :db_id (:id ws-db) :schema main-schema :name %)}))
                (finally
                  (doseq [{:keys [workspace-id]} workspaces
                          :when (t2/exists? :model/Workspace :id workspace-id)]
                    (ws/delete-workspace! workspace-id))))))
          (finally
            (exec! (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" main-schema))))))))

(defn- active-field-names
  "The names of the active shared Fields of the Table with `table-id`."
  [table-id]
  (set (t2/select-fn-set :name :model/Field :table_id table-id :active true)))

(deftest ^:synchronized requests-work-in-the-workspace-they-name-e2e-test
  (do-with-two-workspaces!
   (fn [{:keys [admin-details admin-spec main-schema src-name out-name ws-db workspaces table]}]
     (let [[ws-a ws-b] workspaces
           user-of     (fn [workspace-id]
                         (ffirst (run-query workspace-id {:database (:id ws-db) :type :native
                                                          :native   {:query "SELECT current_user"}})))
           out-table   (table out-name)
           out-query   (let [mp (mt/metadata-provider)]
                         (lib/query mp (lib.metadata/table mp (:id out-table))))
           sql         (format "SELECT id, v, current_user::text AS who FROM \"%s\".\"%s\"" main-schema src-name)
           transform   (t2/insert-returning-instance! :model/Transform
                                                      {:name   (str "transform-" out-name)
                                                       :source {:type :query :query (lib/native-query (mt/metadata-provider) sql)}
                                                       :target {:type :table :schema main-schema :name out-name}})]
       (testing "a request connects with the login of the workspace it names, and with the Database's own without one"
         (is (= (:user admin-details) (user-of nil)))
         (is (= (get-in ws-a [:database_details :user]) (user-of (:workspace-id ws-a))))
         (is (= (get-in ws-b [:database_details :user]) (user-of (:workspace-id ws-b)))))
       (testing "the same transform, run in each workspace, writes to that workspace's isolation schema"
         (run-transform! (:workspace-id ws-a) (:id transform))
         (run-transform! (:workspace-id ws-b) (:id transform))
         (is (= [{:id 99 :v "pre-existing"}]
                (jdbc/query admin-spec [(format "SELECT id, v FROM \"%s\".\"%s\"" main-schema out-name)])))
         (doseq [{:keys [output_namespace]} workspaces]
           (is (= 2 (count (jdbc/query admin-spec [(format "SELECT 1 FROM \"%s\".\"%s__%s\""
                                                           output_namespace main-schema out-name)]))))))
       (testing "a request in each workspace reads its own output through the canonical table"
         (doseq [{:keys [workspace-id database_details]} workspaces]
           (is (= [[1 "a" (:user database_details)] [2 "b" (:user database_details)]]
                  (run-query workspace-id out-query)))))
       (testing "a request in no workspace reads the canonical table"
         (is (= [[99 "pre-existing"]] (run-query nil out-query))))
       (testing "the shared metadata does not change"
         (is (= #{"id" "v"} (active-field-names (:id out-table))))
         (is (=? {:active false} (t2/select-one :model/Field :table_id (:id out-table) :name "who"))))
       (testing "each workspace's query_metadata lists the columns of its copy"
         (let [path (format "table/%d/query_metadata" (:id out-table))]
           (doseq [{:keys [workspace-id]} workspaces]
             (is (= ["id" "v" "who"]
                    (map :name (:fields (mt/user-http-request :crowberto :get 200 path (headers workspace-id)))))))
           (is (= ["id" "v"] (map :name (:fields (mt/user-http-request :crowberto :get 200 path)))))))
       (testing "deleting a workspace deletes its remappings and copy rows, and leaves the other's"
         (ws/delete-workspace! (:workspace-id ws-a))
         (is (= #{(:workspace-id ws-b)} (t2/select-fn-set :workspace_id :model/TableRemapping :database_id (:id ws-db))))
         (is (= #{(:workspace-id ws-b)} (t2/select-fn-set :workspace_id :model/WorkspaceFieldCopy)))
         (is (= [[1 "a" (get-in ws-b [:database_details :user])] [2 "b" (get-in ws-b [:database_details :user])]]
                (run-query (:workspace-id ws-b) out-query))))))))
