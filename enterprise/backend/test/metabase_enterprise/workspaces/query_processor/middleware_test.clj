(ns metabase-enterprise.workspaces.query-processor.middleware-test
  "Tests for workspace table remapping middleware.

   Contract: the middleware reads `TableRemapping` rows for the query's `:database` id from the
   app DB, and installs overrides on the cached metadata provider attached at `[:lib/metadata]`
   so that downstream HoneySQL compilation emits the workspace schema/name when it resolves
   `:source-table <id>`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.query-processor.middleware :as ws.qp.middleware]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(deftest ^:parallel no-op-when-no-remapping-test
  (testing "query passes through unchanged when no remappings exist for the query's database"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (is (= query (ws.qp.middleware/apply-workspace-table-remapping query))))))

(deftest remaps-source-table-from-app-db-test
  (testing "middleware reads TableRemapping rows for the query's database and redirects table refs"
    (let [mp                   (mt/metadata-provider)
          db-id                (mt/id)
          orders               (lib.metadata/table mp (mt/id :orders))
          {from-schema :schema
           from-name   :name}  orders
          to-schema            "ws_bryan_apr21"
          to-name              "orders_copy"
          query-with-old-names (lib/query mp orders)]
      (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                              :from_schema     from-schema
                                              :from_table_name from-name
                                              :to_schema       to-schema
                                              :to_table_name   to-name}]
        (let [query-with-new-names (ws.qp.middleware/apply-workspace-table-remapping
                                    query-with-old-names)
              sql                  (:query (qp.compile/compile query-with-new-names))]
          (testing "new schema and name appear in the compiled SQL"
            (is (str/includes? sql to-schema))
            (is (str/includes? sql to-name)))
          (testing "old schema and name do not appear in the compiled SQL"
            (is (not (str/includes? sql from-schema)))
            (is (not (str/includes? sql from-name)))))))))
