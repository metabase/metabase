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
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
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

(deftest remaps-without-eager-table-enumeration-test
  (testing "override fires even when the provider's `tables` list is empty"
    ;; Regression guard for the post-transform fingerprint failure mode: the fingerprint sub-QP
    ;; builds a fresh cached MP inside `table-rows-sample`. If the middleware drove the override
    ;; off `(lib.metadata/tables mp)`, any case where that enumeration missed the just-created
    ;; transform-output table (stale cache, filtered listing, race against the insert) skipped the
    ;; override and the compiled SQL leaked the logical schema/table. Iterating the `mappings` and
    ;; using `metadatas` with a `:name` spec makes the override robust to enumeration behavior.
    (let [mp       (mt/metadata-provider)
          db-id    (mt/id)
          orders   (lib.metadata/table mp (mt/id :orders))
          {from-schema :schema
           from-name   :name} orders
          to-schema "ws_enumeration_miss"
          to-name   "orders_copy"
          ;; Wrap `mp` with a provider that reports *no* tables on enumeration but passes every
          ;; other call through. This simulates the enumeration-miss case structurally.
          blind-tables-mp (reify
                            lib.metadata.protocols/MetadataProvider
                            (database [_] (lib.metadata.protocols/database mp))
                            (metadatas [_ spec]
                              (if (and (= (:lib/type spec) :metadata/table)
                                       (not (or (:id spec) (:name spec))))
                                []
                                (lib.metadata.protocols/metadatas mp spec)))
                            (setting [_ s] (lib.metadata.protocols/setting mp s)))
          cached-mp       (lib.metadata.cached-provider/cached-metadata-provider
                           blind-tables-mp)
          query           (-> (lib/query mp orders)
                              (assoc :lib/metadata cached-mp))]
      (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                              :from_schema     from-schema
                                              :from_table_name from-name
                                              :to_schema       to-schema
                                              :to_table_name   to-name}]
        (let [remapped (ws.qp.middleware/apply-workspace-table-remapping query)
              sql      (:query (qp.compile/compile remapped))]
          (is (str/includes? sql to-schema))
          (is (str/includes? sql to-name))
          (is (not (str/includes? sql from-name))))))))

(deftest remaps-nested-native-sql-test
  (testing (str "stage 0 native SQL is rewritten even when an outer MBQL stage wraps it — this is the "
                "`[native, mbql]` shape produced when a native source card is resolved into a flat pipeline")
    (binding [driver/*driver* :h2]
      (let [mp        (mt/metadata-provider)
            db-id     (mt/id)
            orders    (lib.metadata/table mp (mt/id :orders))
            {from-schema :schema
             from-name   :name} orders
            to-schema "ws_bryan_apr21"
            to-name   "orders_copy"
            query     (-> (lib/native-query
                           mp
                           (str "SELECT * FROM \"" from-schema "\".\"" from-name "\""))
                          lib/append-stage)]
        (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                                :from_schema     from-schema
                                                :from_table_name from-name
                                                :to_schema       to-schema
                                                :to_table_name   to-name}]
          (let [remapped (ws.qp.middleware/apply-workspace-table-remapping query)
                sql     (lib/raw-native-query remapped)]
            (testing "stage 0 native SQL has the workspace schema/name"
              (is (str/includes? sql to-schema))
              (is (str/includes? sql to-name)))
            (testing "original schema/name no longer appear in stage 0 native SQL"
              (is (not (str/includes? sql from-schema)))
              (is (not (str/includes? sql from-name))))
            (testing "outer MBQL stage is passed through unchanged"
              (is (= (get-in query    [:stages 1])
                     (get-in remapped [:stages 1]))))))))))

(deftest legacy-apply-workspace-remapping-handles-nested-native-test
  (testing "legacy `apply-workspace-remapping` also rewrites stage 0 native SQL on a [native, mbql] query"
    (binding [driver/*driver* :h2]
      (let [mp        (mt/metadata-provider)
            from-schema "PUBLIC"
            from-name "ORDERS"
            to-schema "ws_legacy"
            to-name   "orders_copy"
            query     (-> (lib/native-query
                           mp
                           (str "SELECT * FROM \"" from-schema "\".\"" from-name "\""))
                          lib/append-stage
                          (assoc-in [:middleware :workspace-remapping]
                                    {:tables {{:schema from-schema :table from-name}
                                              {:schema to-schema   :table to-name}}}))
            remapped  (ws.qp.middleware/apply-workspace-remapping query)
            sql       (lib/raw-native-query remapped)]
        (is (str/includes? sql to-schema))
        (is (str/includes? sql to-name))
        (is (not (str/includes? sql from-name)))))))

(deftest no-op-when-workspaces-feature-disabled-test
  (testing "dispatching var returns query unchanged when :workspaces premium feature is off"
    ;; Calls the public `defenterprise` dispatching var (not the ee impl) so the feature gate
    ;; runs. With no premium features, `defenterprise` routes to the OSS stub in
    ;; `metabase.query-processor.middleware.enterprise`, which returns the query unchanged even
    ;; though a matching `TableRemapping` row exists.
    (mt/with-premium-features #{}
      (let [mp       (mt/metadata-provider)
            db-id    (mt/id)
            orders   (lib.metadata/table mp (mt/id :orders))
            {from-schema :schema
             from-name   :name} orders
            query    (lib/query mp orders)]
        (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                                :from_schema     from-schema
                                                :from_table_name from-name
                                                :to_schema       "ws_feature_off"
                                                :to_table_name   "orders_copy"}]
          (is (= query (qp.middleware.enterprise/apply-workspace-table-remapping query))))))))

(deftest skip-workspace-remapping-var-short-circuits-mbql-test
  (testing "apply-workspace-table-remapping is a no-op when *skip-workspace-remapping?* is bound true, even with matching rows"
    (let [mp       (mt/metadata-provider)
          db-id    (mt/id)
          orders   (lib.metadata/table mp (mt/id :orders))
          {from-schema :schema
           from-name   :name} orders
          query    (lib/query mp orders)]
      (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                              :from_schema     from-schema
                                              :from_table_name from-name
                                              :to_schema       "ws_skip_test"
                                              :to_table_name   "orders_copy"}]
        (binding [qp.middleware.enterprise/*skip-workspace-remapping?* true]
          (let [remapped (ws.qp.middleware/apply-workspace-table-remapping query)
                sql      (:query (qp.compile/compile remapped))]
            (testing "query is returned structurally unchanged"
              (is (= query remapped)))
            (testing "compiled SQL references the original schema/table, not a workspace copy"
              (is (str/includes? sql from-name))
              (is (not (str/includes? sql "ws_skip_test")))
              (is (not (str/includes? sql "orders_copy"))))))))))

(deftest skip-workspace-remapping-var-short-circuits-native-test
  (testing "native branch of apply-workspace-table-remapping is a no-op when the skip var is true"
    (binding [driver/*driver* :h2]
      (let [mp        (mt/metadata-provider)
            db-id     (mt/id)
            orders    (lib.metadata/table mp (mt/id :orders))
            {from-schema :schema
             from-name   :name} orders
            sql-input (str "SELECT * FROM \"" from-schema "\".\"" from-name "\"")
            query     (lib/native-query mp sql-input)]
        (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                                :from_schema     from-schema
                                                :from_table_name from-name
                                                :to_schema       "ws_skip_test"
                                                :to_table_name   "orders_copy"}]
          (binding [qp.middleware.enterprise/*skip-workspace-remapping?* true]
            (let [remapped (ws.qp.middleware/apply-workspace-table-remapping query)]
              (is (= query remapped))
              (is (= sql-input (get-in remapped [:stages 0 :native]))))))))))

(deftest skip-workspace-remapping-var-short-circuits-legacy-test
  (testing "apply-workspace-remapping (legacy) is a no-op when the skip var is true, even with a :workspace-remapping middleware key"
    (binding [driver/*driver* :h2]
      (let [mp       (mt/metadata-provider)
            orders   (lib.metadata/table mp (mt/id :orders))
            {from-schema :schema
             from-name   :name} orders
            sql-input (str "SELECT * FROM \"" from-schema "\".\"" from-name "\"")
            query    (-> (lib/native-query mp sql-input)
                         (assoc-in [:middleware :workspace-remapping]
                                   {:tables {{:schema from-schema :table from-name}
                                             {:schema "ws_skip_test" :table "orders_copy"}}}))]
        (binding [qp.middleware.enterprise/*skip-workspace-remapping?* true]
          (let [remapped (ws.qp.middleware/apply-workspace-remapping query)]
            (is (= query remapped))
            (is (= sql-input (get-in remapped [:stages 0 :native])))))))))

(deftest dataset-native-endpoint-returns-presentation-identifiers-test
  (testing "POST /api/dataset/native returns the presentation (pre-remap) schema/table, not the physical workspace copy"
    (mt/with-premium-features #{:workspaces}
      (let [mp        (mt/metadata-provider)
            db-id     (mt/id)
            orders    (lib.metadata/table mp (mt/id :orders))
            {from-schema :schema
             from-name   :name} orders
            to-schema "ws_native_endpoint_test"
            to-name   "orders_copy"]
        (mt/with-temp [:model/TableRemapping _ {:database_id     db-id
                                                :from_schema     from-schema
                                                :from_table_name from-name
                                                :to_schema       to-schema
                                                :to_table_name   to-name}]
          (let [response (mt/user-http-request :crowberto :post 200 "dataset/native"
                                               (assoc (mt/mbql-query orders {:limit 1})
                                                      :pretty false))
                sql      (:query response)]
            (testing "compiled SQL references the presentation identifiers the user authored against"
              (is (str/includes? sql from-name)))
            (testing "compiled SQL does not leak the physical workspace-isolated identifiers"
              (is (not (str/includes? sql to-schema)))
              (is (not (str/includes? sql to-name))))))))))
