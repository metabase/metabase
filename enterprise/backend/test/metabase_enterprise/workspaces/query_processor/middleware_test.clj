(ns metabase-enterprise.workspaces.query-processor.middleware-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.query-processor.middleware :as ws.middleware]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

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
              mock-qp (fn [query rff] (reset! called? true) :ok)
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
                mock-qp      (fn [query rff] (reset! called-with query) :ok)
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
                mock-qp    (fn [query rff] (reset! called-with query) :ok)
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
                mock-qp    (fn [query rff] (reset! called-with query) :ok)
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
                mock-qp    (fn [query rff] (reset! called-with query) :ok)
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
                mock-qp (fn [query rff] (reset! called? true) :ok)
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
                mock-qp    (fn [query rff] (reset! called-with query) :ok)
                wrapped    (#'ws.middleware/apply-workspace-sql-remapping mock-qp)
                query      {:database    (mt/id)
                            :qp/compiled {:query "SELECT * FROM PUBLIC.VENUES"}}]
            (wrapped query identity)
            (let [rewritten (get-in @called-with [:qp/compiled :query])]
              (is (re-find #"(?i)ws_unsynced" rewritten)
                  "Phase 2 emits the to-side schema in the rewritten SQL")
              (is (re-find #"(?i)venues_unsynced" rewritten)
                  "Phase 2 emits the to-side table name in the rewritten SQL"))))))))
