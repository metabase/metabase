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
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(deftest ^:parallel no-op-when-no-remapping-test
  (testing "query passes through unchanged when no remappings exist for the query's database"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (is (= query (ws.qp.middleware/apply-workspace-table-remapping query))))))

(deftest no-op-when-no-matching-remapping-test
  (testing "compiled SQL is unchanged when a TableRemapping row exists but does not match any table in the query"
    (let [mp     (mt/metadata-provider)
          db-id  (mt/id)
          orders (lib.metadata/table mp (mt/id :orders))
          query  (lib/query mp orders)
          sql-before (:query (qp.compile/compile query))]
      (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                              :from_schema     "nonexistent_schema"
                                              :from_table_name "nonexistent_table"
                                              :to_schema       "ws_bryan_apr21"
                                              :to_table_name   "orders_copy"}]
        (let [remapped  (ws.qp.middleware/apply-workspace-table-remapping query)
              sql-after (:query (qp.compile/compile remapped))]
          (is (= sql-before sql-after)))))))

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

(deftest remaps-native-sql-from-app-db-test
  (testing "native SQL queries remap table references via the TableRemapping app-DB table"
    (binding [driver/*driver* :h2]
      (let [mp        (mt/metadata-provider)
            db-id     (mt/id)
            orders    (lib.metadata/table mp (mt/id :orders))
            {from-schema :schema
             from-name   :name} orders
            to-schema "ws_bryan_apr21"
            to-name   "orders_copy"
            query     (lib/native-query mp (str "SELECT * FROM \"" from-schema "\".\"" from-name "\""))]
        (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                                :from_schema     from-schema
                                                :from_table_name from-name
                                                :to_schema       to-schema
                                                :to_table_name   to-name}]
          (let [remapped (ws.qp.middleware/apply-workspace-table-remapping query)
                sql     (get-in remapped [:stages 0 :native])]
            (testing "new schema and name appear in the rewritten SQL"
              (is (str/includes? sql to-schema))
              (is (str/includes? sql to-name)))
            (testing "old schema and name do not appear in the rewritten SQL"
              (is (not (str/includes? sql from-schema)))
              (is (not (str/includes? sql from-name))))))))))

(deftest native-no-op-when-no-remapping-test
  (testing "native query passes through unchanged when no remappings exist for the query's database"
    (binding [driver/*driver* :h2]
      (let [mp    (mt/metadata-provider)
            query (lib/native-query mp "SELECT * FROM \"PUBLIC\".\"ORDERS\"")]
        (is (= query (ws.qp.middleware/apply-workspace-table-remapping query)))))))

(deftest native-no-op-when-no-matching-remapping-test
  (testing "native SQL is unchanged when a TableRemapping row exists but does not match any table in the query"
    (binding [driver/*driver* :h2]
      (let [mp    (mt/metadata-provider)
            db-id (mt/id)
            sql   "SELECT * FROM \"PUBLIC\".\"ORDERS\""
            query (lib/native-query mp sql)]
        (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                                :from_schema     "nonexistent_schema"
                                                :from_table_name "nonexistent_table"
                                                :to_schema       "ws_bryan_apr21"
                                                :to_table_name   "orders_copy"}]
          (let [remapped (ws.qp.middleware/apply-workspace-table-remapping query)]
            (is (= sql (get-in remapped [:stages 0 :native])))))))))

(deftest remaps-fields-on-remapped-source-table-test
  (testing "SELECTed fields on a remapped source table compile correctly"
    ;; Regression guard: MBQL `:field` refs compile to `"alias"."column_name"` (via
    ;; `field-source-table-aliases` in `->honeysql [:sql :field]`), NOT to
    ;; `"schema"."table"."column"`. Only the FROM/JOIN clause emits schema.table, and that path
    ;; goes through `->honeysql [:sql :metadata/table]` which IS covered by our override. So
    ;; remapping the table should flip the FROM clause but leave field column names untouched —
    ;; no "name-based field ref upgrade" is required.
    (let [mp        (mt/metadata-provider)
          db-id     (mt/id)
          orders    (lib.metadata/table mp (mt/id :orders))
          order-id  (lib.metadata/field mp (mt/id :orders :id))
          order-tot (lib.metadata/field mp (mt/id :orders :total))
          {from-schema :schema
           from-name   :name} orders
          to-schema "ws_bryan_apr21"
          to-name   "orders_copy"
          query     (-> (lib/query mp orders)
                        (lib/with-fields [order-id order-tot]))]
      (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                              :from_schema     from-schema
                                              :from_table_name from-name
                                              :to_schema       to-schema
                                              :to_table_name   to-name}]
        (let [remapped (ws.qp.middleware/apply-workspace-table-remapping query)
              sql      (:query (qp.compile/compile remapped))]
          (testing "FROM clause uses the workspace schema and table name"
            (is (str/includes? sql to-schema))
            (is (str/includes? sql to-name)))
          (testing "original schema/table do not leak into compiled SQL"
            (is (not (str/includes? sql from-name))))
          (testing "field column names are unchanged by remapping"
            (is (str/includes? sql (:name order-id)))
            (is (str/includes? sql (:name order-tot)))))))))

(deftest remaps-joined-table-test
  (testing "explicit joins to a remapped table resolve to the workspace schema/name in compiled SQL"
    (let [mp        (mt/metadata-provider)
          db-id     (mt/id)
          orders    (lib.metadata/table mp (mt/id :orders))
          products  (lib.metadata/table mp (mt/id :products))
          ord-pid   (lib.metadata/field mp (mt/id :orders :product_id))
          prd-id    (lib.metadata/field mp (mt/id :products :id))
          {from-schema :schema
           from-name   :name} products
          to-schema "ws_bryan_apr21"
          to-name   "products_copy"
          query     (-> (lib/query mp orders)
                        (lib/join (-> (lib/join-clause products [(lib/= ord-pid prd-id)])
                                      (lib/with-join-alias "Products"))))]
      (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                              :from_schema     from-schema
                                              :from_table_name from-name
                                              :to_schema       to-schema
                                              :to_table_name   to-name}]
        (let [remapped (ws.qp.middleware/apply-workspace-table-remapping query)
              sql      (:query (qp.compile/compile remapped))]
          (testing "joined table resolves to workspace schema/name"
            (is (str/includes? sql to-schema))
            (is (str/includes? sql to-name)))
          (testing "original joined table no longer appears in compiled SQL"
            (is (not (str/includes? sql from-name))))
          (testing "unmapped source table is untouched"
            (is (str/includes? sql (:name orders))))
          (testing "join alias is preserved (aliases live on the join clause, not on table metadata)"
            (is (str/includes? sql "\"Products\""))))))))
