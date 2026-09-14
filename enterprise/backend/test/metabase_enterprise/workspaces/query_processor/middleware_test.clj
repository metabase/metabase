(ns metabase-enterprise.workspaces.query-processor.middleware-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.query-processor.middleware :as ws.qp.middleware]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(defn- clear-remappings-cache!
  "`t2/insert!` (via `mt/with-temp`) bypasses the read-cache invalidation that `ws.impl/remap-table!` and
  `ws.impl/unmap-table!` do, so tests that write the remapping row directly must clear it themselves before
  relying on `ws.impl/remappings-for-db` (and thus the middleware) to see the new row."
  []
  (#'ws.impl/clear-remappings-cache!))

(deftest mbql-query-reads-the-workspace-table-test
  (testing "An MBQL query on a remapped table compiles to SQL naming the workspace table -- the Table metadata it
            compiles from comes through the overlay, so no middleware is involved"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id :orders))]
          (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id       (mt/id)
                                                           :from_schema schema
                                                           :from_table  name
                                                           :to_schema   schema
                                                           :to_table    "ws_remap_target"}]
            (clear-remappings-cache!)
            ;; a fresh provider: the one above cached the Table before the remapping existed
            (let [mp       (mt/metadata-provider)
                  query    (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  compiled (qp.compile/compile query)]
              (is (re-find #"(?i)ws_remap_target" (:query compiled))
                  "compiled SQL names the workspace table")
              (is (not (re-find (re-pattern (str "(?i)\\b" name "\\b")) (:query compiled)))
                  "compiled SQL does not name the canonical table"))))))))

(deftest mbql-query-reads-the-canonical-table-when-disabled-test
  (testing "The same query with workspaces-enabled false compiles to SQL naming the canonical table"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled false]
        (let [mp                     (mt/metadata-provider)
              {:keys [schema name]}  (lib.metadata/table mp (mt/id :orders))]
          (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id       (mt/id)
                                                           :from_schema schema
                                                           :from_table  name
                                                           :to_schema   schema
                                                           :to_table    "ws_remap_target"}]
            (let [query    (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  compiled (qp.compile/compile query)]
              (is (re-find (re-pattern (str "(?i)\\b" name "\\b")) (:query compiled))
                  "compiled SQL names the canonical table")
              (is (not (re-find #"(?i)ws_remap_target" (:query compiled)))
                  "compiled SQL does not name the workspace table"))))))))

(deftest native-query-sql-rewritten-to-workspace-table-test
  (testing "A native query's SQL is rewritten to reference the workspace table"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id       (mt/id)
                                                         :from_schema nil
                                                         :from_table  "my_native_source_table"
                                                         :to_schema   nil
                                                         :to_table    "ws_native_target"}]
          (clear-remappings-cache!)
          (let [mp       (mt/metadata-provider)
                query    (lib/native-query mp "SELECT * FROM my_native_source_table")
                compiled (qp.compile/compile query)]
            (is (re-find #"(?i)ws_native_target" (:query compiled))
                "compiled SQL names the workspace table")
            (is (not (re-find #"(?i)my_native_source_table" (:query compiled)))
                "compiled SQL no longer references the canonical table")))))))

(deftest native-dataset-endpoint-uses-canonical-table-test
  (testing "POST /api/dataset/native returns SQL naming the CANONICAL table even while workspaces are enabled"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (let [mp                     (mt/metadata-provider)
              {:keys [schema name]}  (lib.metadata/table mp (mt/id :orders))]
          (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id       (mt/id)
                                                           :from_schema schema
                                                           :from_table  name
                                                           :to_schema   schema
                                                           :to_table    "ws_api_target"}]
            (clear-remappings-cache!)
            (let [query    (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  legacy   (lib.convert/->legacy-MBQL query)
                  response (mt/user-http-request :crowberto :post 200 "dataset/native" legacy)]
              (is (re-find (re-pattern (str "(?i)\\b" name "\\b")) (:query response))
                  "response names the canonical table")
              (is (not (re-find #"(?i)ws_api_target" (:query response)))
                  "response does not name the workspace table"))))))))

(deftest native-cannot-read-a-workspace-schema-directly-test
  (testing "a native query naming a workspace schema is refused: nothing in there is a table to query, and what is
            there may be another workspace's output"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "ws_qp"}}
          (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id :orders))]
            (mt/with-temp [:model/WorkspaceTableRemapping _ {:db_id       (mt/id)
                                                             :from_schema schema
                                                             :from_table  name
                                                             :to_schema   "ws_qp"
                                                             :to_table    "ws_remap_target"}]
              (clear-remappings-cache!)
              (let [mp    (mt/metadata-provider)
                    query (lib/native-query mp "SELECT * FROM ws_qp.ws_remap_target")]
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"workspace schema"
                                      (qp.compile/compile query)))))))))))

(deftest mbql-cannot-read-another-workspaces-table-test
  (testing "the metadata provider refuses a table in a workspace schema that no remapping of ours points at"
    (let [transform (#'ws.qp.middleware/table-transform
                     [{:id 1, :db_id 1, :from_schema "public", :from_table "orders"
                       :to_schema "ws_qp", :to_table "ws_remap_target"}]
                     #{"ws_qp"})]
      (testing "the canonical table is moved to the workspace table backing it"
        (is (= [{:schema "ws_qp", :name "ws_remap_target"}]
               (transform {:lib/type :metadata/table} [{:schema "public", :name "orders"}]))))
      (testing "a table outside the workspace schema is left alone"
        (is (= [{:schema "public", :name "people"}]
               (transform {:lib/type :metadata/table} [{:schema "public", :name "people"}]))))
      (testing "and one in the workspace schema that is not ours is refused -- `table-query` hides it, so reaching
                it means a stale id"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"another workspace"
             (transform {:lib/type :metadata/table} [{:schema "ws_qp", :name "someone_elses_output"}])))))))
