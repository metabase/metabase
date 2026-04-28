(ns metabase-enterprise.workspaces.query-processor.middleware-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.query-processor.middleware :as ws.middleware]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defmacro ^:private with-remappings [db-id remappings & body]
  `(binding [ws.remapping/*remapping-store* (ws.remapping/map-store {~db-id ~remappings})]
     ~@body))

;;; -------------------------------------- Phase 1: Preprocessing (MBQL only) --------------------------------------

(deftest phase-1-no-remappings-passthrough-test
  (testing "Phase 1 passes through when no remappings exist"
    (mt/with-premium-features #{:workspaces}
      (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
        (let [query (mt/mbql-query venues)]
          (is (= query (#'ws.middleware/apply-workspace-remapping query))))))))

(deftest phase-1-skip-dynamic-var-test
  (testing "Phase 1 passes through when *skip-remapping?* is true"
    (mt/with-premium-features #{:workspaces}
      (with-remappings (mt/id) {["PUBLIC" "VENUES"] ["mb_iso_abc" "VENUES"]}
        (binding [ws.remapping/*skip-remapping?* true]
          (let [query (mt/mbql-query venues)]
            (is (= query (#'ws.middleware/apply-workspace-remapping query)))))))))

(deftest phase-1-mbql-table-metadata-swap-test
  (testing "Phase 1 swaps table metadata for MBQL queries"
    (mt/with-premium-features #{:workspaces}
      (qp.store/with-metadata-provider (mt/id)
        (let [venues-table (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))
              original-schema (:schema venues-table)
              original-name   (:name venues-table)]
          (with-remappings (mt/id) {[original-schema original-name] ["mb_iso_workspace" "remapped_venues"]}
            (let [query (-> (lib/query (qp.store/metadata-provider) venues-table)
                            (assoc :database (mt/id)))]
              (#'ws.middleware/apply-workspace-remapping query)
              (let [table-after (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))]
                (is (= "mb_iso_workspace" (:schema table-after)))
                (is (= "remapped_venues" (:name table-after)))))))))))

(deftest phase-1-does-not-touch-native-queries-test
  (testing "Phase 1 passes native queries through unchanged — Phase 2 handles SQL rewriting"
    (mt/with-premium-features #{:workspaces}
      (with-remappings (mt/id) {["PUBLIC" "VENUES"] ["mb_iso_abc" "VENUES"]}
        (qp.store/with-metadata-provider (mt/id)
          (let [query {:lib/type     :mbql/query
                       :database     (mt/id)
                       :lib/metadata (qp.store/metadata-provider)
                       :stages       [{:lib/type :mbql.stage/native
                                       :native   "SELECT * FROM PUBLIC.VENUES"}]}
                result (#'ws.middleware/apply-workspace-remapping query)]
            ;; SQL should be unchanged — Phase 1 doesn't rewrite native SQL
            (is (= "SELECT * FROM PUBLIC.VENUES"
                   (get-in result [:stages 0 :native])))))))))

;;; --------------------------------- Phase 2: Post-Compilation SQL Rewrite ----------------------------------------

(deftest phase-2-no-remappings-passthrough-test
  (testing "Phase 2 passes through when no remappings exist"
    (mt/with-premium-features #{:workspaces}
      (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {})]
        (let [called? (atom false)
              mock-qp (fn [_query _rff] (reset! called? true) :ok)
              wrapped  (#'ws.middleware/apply-workspace-sql-remapping mock-qp)
              query    {:database (mt/id)
                        :qp/compiled {:query "SELECT * FROM foo"}}]
          (wrapped query identity)
          (is @called?))))))

(deftest phase-2-skip-dynamic-var-test
  (testing "Phase 2 passes through when *skip-remapping?* is true"
    (mt/with-premium-features #{:workspaces}
      (with-remappings (mt/id) {["PUBLIC" "VENUES"] ["mb_iso_abc" "VENUES"]}
        (binding [ws.remapping/*skip-remapping?* true]
          (let [original-sql "SELECT * FROM PUBLIC.VENUES"
                called-with  (atom nil)
                mock-qp      (fn [query _rff] (reset! called-with query) :ok)
                wrapped      (#'ws.middleware/apply-workspace-sql-remapping mock-qp)
                query        {:database (mt/id)
                              :qp/compiled {:query original-sql}}]
            (wrapped query identity)
            (is (= original-sql (get-in @called-with [:qp/compiled :query])))))))))

(deftest phase-2-rewrites-compiled-sql-test
  (testing "Phase 2 rewrites table references in compiled SQL"
    (mt/with-premium-features #{:workspaces}
      (with-remappings (mt/id) {["PUBLIC" "VENUES"] ["mb_iso_abc" "VENUES"]}
        (binding [driver/*driver* :h2]
          (let [called-with (atom nil)
                mock-qp    (fn [query _rff] (reset! called-with query) :ok)
                wrapped    (#'ws.middleware/apply-workspace-sql-remapping mock-qp)
                query      {:database (mt/id)
                            :qp/compiled {:query "SELECT * FROM PUBLIC.VENUES"}}]
            (wrapped query identity)
            (let [rewritten (get-in @called-with [:qp/compiled :query])]
              (is (some? rewritten))
              (is (re-find #"(?i)mb_iso_abc" rewritten)))))))))

(deftest phase-2-rewrites-compiled-inline-too-test
  (testing "Phase 2 also rewrites :qp/compiled-inline"
    (mt/with-premium-features #{:workspaces}
      (with-remappings (mt/id) {["PUBLIC" "VENUES"] ["mb_iso_abc" "VENUES"]}
        (binding [driver/*driver* :h2]
          (let [called-with (atom nil)
                mock-qp    (fn [query _rff] (reset! called-with query) :ok)
                wrapped    (#'ws.middleware/apply-workspace-sql-remapping mock-qp)
                query      {:database           (mt/id)
                            :qp/compiled        {:query "SELECT * FROM PUBLIC.VENUES"}
                            :qp/compiled-inline {:query "SELECT * FROM PUBLIC.VENUES"}}]
            (wrapped query identity)
            (is (re-find #"(?i)mb_iso_abc" (get-in @called-with [:qp/compiled-inline :query])))))))))

(deftest phase-2-preserves-params-test
  (testing "Phase 2 preserves query params when rewriting SQL"
    (mt/with-premium-features #{:workspaces}
      (with-remappings (mt/id) {["PUBLIC" "VENUES"] ["mb_iso_abc" "VENUES"]}
        (binding [driver/*driver* :h2]
          (let [called-with (atom nil)
                mock-qp    (fn [query _rff] (reset! called-with query) :ok)
                wrapped    (#'ws.middleware/apply-workspace-sql-remapping mock-qp)
                query      {:database    (mt/id)
                            :qp/compiled {:query "SELECT * FROM PUBLIC.VENUES WHERE id = ?"
                                          :params [42]}}]
            (wrapped query identity)
            (let [rewritten-sql (get-in @called-with [:qp/compiled :query])
                  params        (get-in @called-with [:qp/compiled :params])]
              (is (re-find #"(?i)mb_iso_abc" rewritten-sql))
              (is (= [42] params)))))))))

(deftest phase-2-noop-when-already-remapped-test
  (testing "Phase 2 passes through when all refs are already in the workspace schema"
    (mt/with-premium-features #{:workspaces}
      (with-remappings (mt/id) {["PUBLIC" "VENUES"] ["mb_iso_abc" "VENUES"]}
        (binding [driver/*driver* :h2]
          (let [called? (atom false)
                mock-qp (fn [_query _rff] (reset! called? true) :ok)
                wrapped (#'ws.middleware/apply-workspace-sql-remapping mock-qp)
                query   {:database    (mt/id)
                         :qp/compiled {:query "SELECT * FROM mb_iso_abc.VENUES"}}]
            (wrapped query identity)
            (is @called?)))))))

;;; -------------------------------------------- Helper tests -----------------------------------------------------

(deftest build-table-replacements-test
  (testing "builds replacement map with raw identifiers (SQLGlot handles quoting per dialect)"
    (let [remappings {["public" "orders"] ["mb_iso" "orders"]
                      ["public" "users"]  ["mb_iso" "users"]}
          result (#'ws.middleware/build-table-replacements remappings)]
      (is (= 2 (count result)))
      (is (= {:schema "mb_iso" :table "orders"}
             (get result {:schema "public" :table "orders"})))
      (is (= {:schema "mb_iso" :table "users"}
             (get result {:schema "public" :table "users"}))))))

;;; -------------------------- Pre-sync ordering: to-side has no :model/Table yet ----------------------------------
;;;
;;; When a TableRemapping row points to a (to_schema, to_table_name) that has not yet been synced into the app DB,
;;; both phases must still operate correctly. They consume schema/table strings from the remapping store; nothing
;;; should require a hydrated `:model/Table` on the to-side.

(deftest phase-1-handles-to-side-without-model-table-test
  (testing "Phase 1 mutates the from-side metadata even when the to-side has no :model/Table"
    (mt/with-premium-features #{:workspaces}
      (qp.store/with-metadata-provider (mt/id)
        (let [venues-table    (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))
              original-schema (:schema venues-table)
              original-name   (:name venues-table)
              to-schema       "ws_unsynced"
              to-table        "remapped_venues_no_sync"]
          (with-remappings (mt/id) {[original-schema original-name] [to-schema to-table]}
            (let [query (-> (lib/query (qp.store/metadata-provider) venues-table)
                            (assoc :database (mt/id)))]
              ;; Should not throw — the to-side strings are written into the from-side metadata in place.
              (#'ws.middleware/apply-workspace-remapping query)
              (let [table-after (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))]
                (is (= to-schema (:schema table-after))
                    "Phase 1 wrote the to-side schema even with no :model/Table for it")
                (is (= to-table (:name table-after))
                    "Phase 1 wrote the to-side name even with no :model/Table for it")))))))))

(deftest phase-2-handles-to-side-without-model-table-test
  (testing "Phase 2 rewrites SQL using to-side strings even when no :model/Table exists for the to-side"
    (mt/with-premium-features #{:workspaces}
      (with-remappings (mt/id) {["PUBLIC" "VENUES"] ["ws_unsynced" "venues_unsynced"]}
        (binding [driver/*driver* :h2]
          (let [called-with (atom nil)
                mock-qp    (fn [query _rff] (reset! called-with query) :ok)
                wrapped    (#'ws.middleware/apply-workspace-sql-remapping mock-qp)
                query      {:database    (mt/id)
                            :qp/compiled {:query "SELECT * FROM PUBLIC.VENUES"}}]
            (wrapped query identity)
            (let [rewritten (get-in @called-with [:qp/compiled :query])]
              (is (re-find #"(?i)ws_unsynced" rewritten)
                  "Phase 2 emits the to-side schema in the rewritten SQL")
              (is (re-find #"(?i)venues_unsynced" rewritten)
                  "Phase 2 emits the to-side table name in the rewritten SQL"))))))))

;;; ============================================ Read-path ladder ===============================================
;;;
;;; Progressive coverage of every read-path query shape we ship. Each rung adds one bit of complexity. Each rung
;;; asserts the same invariant: remapped tables resolve to the workspace schema; non-remapped tables stay
;;; canonical.
;;;
;;; The ladder subsumes the call-site survey's bypass-path concern from a different angle — instead of enumerating
;;; call sites where remapping might miss, enumerate query shapes and prove each one rewrites correctly.
;;;
;;; All rungs run through Dan's `MapRemappingStore` (no DB temps) and assert on the rewritten SQL produced by
;;; Phase 2. Rungs 8-10 add the MBQL preprocess pipeline, Card execution, and Dashboard execution respectively.

(defn- rewrite-via-phase-2
  "Run `sql` through Phase 2 with the given remappings and return the rewritten SQL."
  [db-id remappings sql]
  (binding [ws.remapping/*remapping-store* (ws.remapping/map-store {db-id remappings})
            driver/*driver*                :h2]
    (let [captured (atom nil)
          mock-qp  (fn [query _rff] (reset! captured query) :ok)
          wrapped  (#'ws.middleware/apply-workspace-sql-remapping mock-qp)]
      (wrapped {:database db-id :qp/compiled {:query sql}} identity)
      (get-in @captured [:qp/compiled :query]))))

(deftest ladder-rung-1-single-table-remapped-test
  (testing "Rung 1: a single remapped table is rewritten to the workspace schema"
    (mt/with-premium-features #{:workspaces}
      (let [rewritten (rewrite-via-phase-2 (mt/id)
                                           {["PUBLIC" "ORDERS"] ["ws_alice" "orders_workspace"]}
                                           "SELECT * FROM PUBLIC.ORDERS")]
        (is (re-find #"(?i)ws_alice"          rewritten))
        (is (re-find #"(?i)orders_workspace"  rewritten))
        (is (not (re-find #"(?i)PUBLIC\.ORDERS\b" rewritten))
            "no canonical reference survives the rewrite")))))

(deftest ladder-rung-2-single-table-not-remapped-test
  (testing "Rung 2: a non-remapped table passes through unchanged (canonical pass-through)"
    (mt/with-premium-features #{:workspaces}
      (let [sql       "SELECT * FROM PUBLIC.VENUES"
            rewritten (rewrite-via-phase-2 (mt/id)
                                           ;; remapping exists for ORDERS, but the query targets VENUES
                                           {["PUBLIC" "ORDERS"] ["ws_alice" "orders_workspace"]}
                                           sql)]
        (is (re-find #"(?i)PUBLIC\.VENUES" rewritten)
            "VENUES has no remapping — the canonical reference must survive")
        (is (not (re-find #"(?i)ws_alice" rewritten))
            "the unrelated workspace schema must not appear")))))

(deftest ladder-rung-3-join-one-remapped-test
  (testing "Rung 3: in a join, only the remapped side is rewritten"
    (mt/with-premium-features #{:workspaces}
      (let [rewritten (rewrite-via-phase-2 (mt/id)
                                           {["PUBLIC" "ORDERS"] ["ws_alice" "orders_workspace"]}
                                           (str "SELECT o.id, u.name "
                                                "FROM PUBLIC.ORDERS o "
                                                "JOIN PUBLIC.USERS u ON o.user_id = u.id"))]
        (is (re-find #"(?i)ws_alice\.orders_workspace" rewritten)
            "ORDERS is remapped to the workspace schema")
        (is (re-find #"(?i)PUBLIC\.USERS" rewritten)
            "USERS has no remapping — its canonical reference survives")))))

(deftest ladder-rung-4-join-both-remapped-test
  (testing "Rung 4: in a join, both remapped sides are rewritten"
    (mt/with-premium-features #{:workspaces}
      (let [rewritten (rewrite-via-phase-2 (mt/id)
                                           {["PUBLIC" "ORDERS"] ["ws_alice" "orders_workspace"]
                                            ["PUBLIC" "USERS"]  ["ws_alice" "users_workspace"]}
                                           (str "SELECT o.id, u.name "
                                                "FROM PUBLIC.ORDERS o "
                                                "JOIN PUBLIC.USERS u ON o.user_id = u.id"))]
        (is (re-find #"(?i)ws_alice\.orders_workspace" rewritten))
        (is (re-find #"(?i)ws_alice\.users_workspace"  rewritten))
        (is (not (re-find #"(?i)PUBLIC\.ORDERS\b" rewritten)))
        (is (not (re-find #"(?i)PUBLIC\.USERS\b"  rewritten)))))))

(deftest ladder-rung-5-three-tables-mixed-remapping-test
  (testing "Rung 5: three tables, mixed remapping — only the configured ones are rewritten"
    (mt/with-premium-features #{:workspaces}
      (let [rewritten (rewrite-via-phase-2 (mt/id)
                                           {["PUBLIC" "ORDERS"]   ["ws_alice" "orders_workspace"]
                                            ["PUBLIC" "PRODUCTS"] ["ws_alice" "products_workspace"]}
                                           (str "SELECT o.id, p.name, u.email "
                                                "FROM PUBLIC.ORDERS o "
                                                "JOIN PUBLIC.PRODUCTS p ON o.product_id = p.id "
                                                "JOIN PUBLIC.USERS u    ON o.user_id    = u.id"))]
        (is (re-find #"(?i)ws_alice\.orders_workspace"   rewritten))
        (is (re-find #"(?i)ws_alice\.products_workspace" rewritten))
        (is (re-find #"(?i)PUBLIC\.USERS" rewritten)
            "USERS is the only un-remapped table; its canonical ref survives")))))

(deftest ladder-rung-6-cte-mixed-remapping-test
  (testing "Rung 6: a CTE referencing both remapped and non-remapped tables is rewritten correctly"
    (mt/with-premium-features #{:workspaces}
      (let [rewritten (rewrite-via-phase-2 (mt/id)
                                           {["PUBLIC" "ORDERS"] ["ws_alice" "orders_workspace"]}
                                           (str "WITH recent_orders AS ("
                                                "  SELECT * FROM PUBLIC.ORDERS WHERE created_at > '2026-01-01'"
                                                ") "
                                                "SELECT o.id, u.email "
                                                "FROM recent_orders o "
                                                "JOIN PUBLIC.USERS u ON o.user_id = u.id"))]
        (is (re-find #"(?i)ws_alice\.orders_workspace" rewritten)
            "ORDERS reference inside the CTE body is rewritten")
        (is (re-find #"(?i)PUBLIC\.USERS" rewritten)
            "USERS outside the CTE keeps its canonical ref")))))

(deftest ladder-rung-7-subquery-mixed-remapping-test
  (testing "Rung 7: a nested subquery referencing both kinds of tables is rewritten correctly"
    (mt/with-premium-features #{:workspaces}
      (let [rewritten (rewrite-via-phase-2 (mt/id)
                                           {["PUBLIC" "ORDERS"] ["ws_alice" "orders_workspace"]}
                                           (str "SELECT u.id, u.name, "
                                                "       (SELECT COUNT(*) FROM PUBLIC.ORDERS o WHERE o.user_id = u.id) AS n "
                                                "FROM PUBLIC.USERS u"))]
        (is (re-find #"(?i)ws_alice\.orders_workspace" rewritten)
            "ORDERS inside the correlated subquery is rewritten")
        (is (re-find #"(?i)PUBLIC\.USERS" rewritten)
            "USERS in the outer query keeps its canonical ref")))))

(deftest ladder-rung-8-mbql-phase-1-metadata-override-test
  (testing "Rung 8: MBQL preprocess (Phase 1) overrides table metadata so HoneySQL emits workspace identifiers"
    (mt/with-premium-features #{:workspaces}
      (qp.store/with-metadata-provider (mt/id)
        (let [venues          (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))
              original-schema (:schema venues)
              original-name   (:name venues)]
          (with-remappings (mt/id) {[original-schema original-name] ["ws_alice" "venues_workspace"]}
            (let [query (-> (lib/query (qp.store/metadata-provider) venues)
                            (assoc :database (mt/id)))]
              (#'ws.middleware/apply-workspace-remapping query)
              (let [after (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))]
                (is (= "ws_alice"         (:schema after))
                    "Phase 1 wrote the workspace schema into the cached metadata")
                (is (= "venues_workspace" (:name after))
                    "Phase 1 wrote the workspace table name into the cached metadata")))))))))

(deftest ladder-rung-9-card-execution-path-test
  (testing "Rung 9: a Card whose dataset_query targets a remapped table compiles to workspace SQL"
    (mt/with-premium-features #{:workspaces}
      (qp.store/with-metadata-provider (mt/id)
        (let [venues          (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))
              original-schema (:schema venues)
              original-name   (:name venues)]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)
                                                    :database_id   (mt/id)}]
            (with-remappings (mt/id) {[original-schema original-name] ["ws_alice" "venues_workspace"]}
              (let [card        (t2/select-one :model/Card :id card-id)
                    mbql-query  (-> (:dataset_query card)
                                    (assoc :lib/metadata (qp.store/metadata-provider)))
                    ;; Phase 1 runs during preprocess, mutating the metadata provider in place.
                    preprocessed (qp.preprocess/preprocess mbql-query)
                    compiled    (qp.compile/compile preprocessed)
                    ;; Phase 2 runs during execute. Apply it to the compiled SQL.
                    rewritten   (binding [driver/*driver* :h2]
                                  (let [captured (atom nil)
                                        mock-qp  (fn [q _rff] (reset! captured q) :ok)
                                        wrapped  (#'ws.middleware/apply-workspace-sql-remapping mock-qp)]
                                    (wrapped (assoc preprocessed
                                                    :database (mt/id)
                                                    :qp/compiled compiled)
                                             identity)
                                    (get-in @captured [:qp/compiled :query])))]
                (is (re-find #"(?i)ws_alice|venues_workspace" rewritten)
                    "Card MBQL → preprocess → compile → Phase 2 produces workspace identifiers")))))))))

(deftest ladder-rung-10-dashboard-multiple-cards-mixed-remapping-test
  (testing "Rung 10: a Dashboard with multiple cards rewrites each card's SQL according to the remapping config"
    (mt/with-premium-features #{:workspaces}
      (qp.store/with-metadata-provider (mt/id)
        ;; One card targets a remapped table (VENUES), the other a non-remapped table (CHECKINS).
        (mt/with-temp [:model/Dashboard {dash-id :id} {}
                       :model/Card {venues-card-id :id} {:dataset_query (mt/mbql-query venues)
                                                         :database_id   (mt/id)}
                       :model/Card {checkins-card-id :id} {:dataset_query (mt/mbql-query checkins)
                                                           :database_id   (mt/id)}
                       :model/DashboardCard _ {:dashboard_id dash-id :card_id venues-card-id}
                       :model/DashboardCard _ {:dashboard_id dash-id :card_id checkins-card-id}]
          (with-remappings (mt/id) {["PUBLIC" "VENUES"] ["ws_alice" "venues_workspace"]}
            (let [compile-card-sql
                  (fn [card-id]
                    (let [card     (t2/select-one :model/Card :id card-id)
                          query    (-> (:dataset_query card)
                                       (assoc :lib/metadata (qp.store/metadata-provider)))
                          pre      (qp.preprocess/preprocess query)
                          compiled (qp.compile/compile pre)]
                      (binding [driver/*driver* :h2]
                        (let [captured (atom nil)
                              mock-qp  (fn [q _rff] (reset! captured q) :ok)
                              wrapped  (#'ws.middleware/apply-workspace-sql-remapping mock-qp)]
                          (wrapped (assoc pre :database (mt/id) :qp/compiled compiled) identity)
                          (get-in @captured [:qp/compiled :query])))))]
              (testing "the remapped card is rewritten"
                (let [sql (compile-card-sql venues-card-id)]
                  (is (re-find #"(?i)ws_alice|venues_workspace" sql)
                      "venues card targets ws_alice schema after Phase 2")))
              (testing "the non-remapped card passes through canonical"
                (let [sql (compile-card-sql checkins-card-id)]
                  (is (re-find #"(?i)CHECKINS" sql)
                      "checkins card keeps its canonical reference")
                  (is (not (re-find #"(?i)ws_alice" sql))
                      "the workspace schema does not appear in the non-remapped card"))))))))))
