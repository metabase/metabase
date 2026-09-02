(ns metabase-enterprise.entity-retrieval.reconcile-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.measures.test-util :as measures.tu]
   [metabase.metabot.tools.search :as tools.search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

;; raw t2/collections.tu access below runs before any auto-initializing mt helper, so the app db must be
;; set up explicitly — on the appdb-mode CI job this namespace can be the first db touch in the JVM
(use-fixtures :once (fixtures/initialize :db :test-users))

;; OsiAiContext write hooks fire request-entity-sync!, which would spawn a background targeted reconcile
;; using the *real* configured embedding model and race these tests — they drive reconcile! / reconcile-entity!
;; with the mock model directly. Suppress the nudge here; the hook -> drain path is covered in core-test.
;; The ignore is for re-binding a bang fn in a fixture: validate-deftest flags it as a destructive call, but
;; we only redef it to a no-op, never invoke it.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each
  (fn [thunk]
    (mt/with-dynamic-fn-redefs [mirror/request-entity-sync! (fn [& _] nil)]
      (thunk))))

(deftest entity-class-test
  (let [entity-class (var-get #'reconcile/entity-class)]
    (testing "a Card's question/metric/model labels collapse to one class, so a type flip still matches"
      (is (= (entity-class {:entity_type "metric" :entity_local_id 5})
             (entity-class {:entity_type "model" :entity_local_id 5})
             (entity-class {:entity_type "question" :entity_local_id 5}))))
    (testing "a same-id entity of another type is a distinct class (no false-positive sparing)"
      (is (not= (entity-class {:entity_type "table" :entity_local_id 5})
                (entity-class {:entity_type "metric" :entity_local_id 5})))
      (is (not= (entity-class {:entity_type "measure" :entity_local_id 5})
                (entity-class {:entity_type "segment" :entity_local_id 5}))))))

(deftest format-embedding-rejects-invalid-values-test
  (testing "non-numbers, NaN and infinities are rejected before they reach a raw SQL literal"
    (doseq [bad [Double/NaN Double/POSITIVE_INFINITY Double/NEGATIVE_INFINITY "0.1"]]
      (is (thrown-with-msg? Exception #"invalid value"
                            (index-table/format-embedding [0.1 bad 0.3]))
          (pr-str bad)))
    (is (string? (index-table/format-embedding [0.1 -0.2 0.3])))))

(defmacro ^:private with-isolated-index
  "Run `body` with isolated pgvector tables bound and dropped afterwards, binding `ds-sym` to the
  pgvector datasource. Skips the body entirely when no pgvector store is configured."
  [[ds-sym] & body]
  `(when semantic.db.datasource/db-url
     (let [suffix# (System/nanoTime)
           ~ds-sym (semantic.db.datasource/ensure-initialized-data-source!)]
       (binding [index-table/*tables* {:vectors (str "library_entity_index_test_" suffix#)
                                       :meta    (str "library_entity_index_meta_test_" suffix#)}]
         (try
           ~@body
           (finally
             (jdbc/execute! ~ds-sym [(str "DROP TABLE IF EXISTS "
                                          (index-table/vectors-table) ", "
                                          (index-table/meta-table))])))))))

(deftest ^:synchronized with-index-read-lock-contention-integration-test
  (when semantic.db.datasource/db-url
    (let [ds       (semantic.db.datasource/ensure-initialized-data-source!)
          lock-id  (var-get #'reconcile/reconcile-lock-id)
          calls    (atom 0)
          callback (fn [_]
                     (swap! calls inc)
                     ::called)]
      (with-open [^Connection writer (jdbc/get-connection ds)]
        (let [acquired? (:acquired
                         (jdbc/execute-one!
                          writer
                          [(format "SELECT pg_try_advisory_lock(%d) AS acquired" lock-id)]
                          {:builder-fn jdbc.rs/as-unqualified-lower-maps}))]
          (is acquired? "the exclusive test lock was acquired without blocking")
          (when acquired?
            (try
              (is (nil? (reconcile/with-index-read-lock ds callback)))
              (is (zero? @calls) "the read callback is skipped while reconcile owns the lock")
              (finally
                (jdbc/execute! writer [(format "SELECT pg_advisory_unlock(%d)" lock-id)])))
            (is (= ::called (reconcile/with-index-read-lock ds callback)))
            (is (= 1 @calls) "the callback runs after the exclusive lock is released")))))))

(defn- index-rows [ds]
  (jdbc/execute! ds
                 [(format "SELECT doc_id, entity_type, entity_local_id, doc_type, doc_text FROM \"%s\""
                          (index-table/vectors-table))]
                 {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- docs-for
  "Index rows describing one entity (robust to any other library content in the test appdb)."
  [ds entity-type entity-local-id]
  (filter #(and (= entity-type (:entity_type %)) (= entity-local-id (:entity_local_id %)))
          (index-rows ds)))

(defn- reconciled-at! [ds]
  (:reconciled_at (jdbc/execute-one! ds
                                     [(format "SELECT reconciled_at FROM \"%s\" WHERE id = 1" (index-table/meta-table))]
                                     {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

(deftest ^:synchronized reconcile-lifecycle-test
  ;; :library lets us publish a Table into a library-data collection; the reconcile enumerates the
  ;; library tree via collections/library-collection + descendant-ids, so we build a real library root.
  (mt/with-premium-features #{:library :library-retrieval}
    (with-isolated-index [ds]
      (let [model semantic.tu/mock-embedding-model]
        (mt/with-temp [:model/Collection {lib-id :id}     {:type "library" :location "/"}
                       :model/Collection {data-id :id}    {:type "library-data" :location (str "/" lib-id "/")}
                       :model/Collection {metrics-id :id}  {:type "library-metrics" :location (str "/" lib-id "/")}
                       :model/Database   {db-id :id}       {}
                       :model/Table      {table-id :id}    {:db_id db-id :collection_id data-id
                                                            :is_published true :active true
                                                            :name "orders" :display_name "Orders"
                                                            :description "All orders"}
                       :model/Card       {metric-id :id}   {:type "metric" :collection_id metrics-id
                                                            :name "Revenue" :description "Total revenue"
                                                            :database_id db-id}
                       :model/OsiAiContext _ {:entity_type "table" :entity_local_id table-id
                                              :ai_context {:instructions "Group by month."
                                                           :synonyms ["sales" "revenue"]
                                                           :examples ["orders last month"]}}]
          (testing "first run indexes name/description docs for every library entity, plus ai_context docs"
            (reconcile/reconcile! ds (constantly model))
            (testing "the published table: name + description + 2 synonyms + 1 example"
              (let [docs (docs-for ds "table" table-id)]
                (is (= {"name" 1 "description" 1 "synonym" 2 "example" 1}
                       (frequencies (map :doc_type docs))))
                (is (= #{"Orders"} (set (map :doc_text (filter #(= "name" (:doc_type %)) docs)))))))
            (testing "the library metric: name + description only (no ai_context)"
              (let [docs (docs-for ds "metric" metric-id)]
                (is (= {"name" 1 "description" 1} (frequencies (map :doc_type docs)))))))
          (testing "an unchanged second run writes nothing"
            (is (=? {:inserted 0 :deleted 0} (reconcile/reconcile! ds (constantly model)))))
          (testing "editing instructions is a no-op for the index (instructions are read live, not stored)"
            (let [before (set (map :doc_id (docs-for ds "table" table-id)))]
              (t2/update! :model/OsiAiContext :entity_type "table" :entity_local_id table-id
                          {:ai_context {:instructions "Group by week."
                                        :synonyms ["sales" "revenue"]
                                        :examples ["orders last month"]}})
              (is (=? {:inserted 0 :deleted 0} (reconcile/reconcile! ds (constantly model))))
              (is (= before (set (map :doc_id (docs-for ds "table" table-id)))) "doc_ids unchanged")))
          (testing "renaming the table mints a new name doc_id and GCs the old one"
            (let [old-name-id (->> (docs-for ds "table" table-id)
                                   (filter #(= "name" (:doc_type %))) first :doc_id)]
              (t2/update! :model/Table table-id {:display_name "Sales Orders"})
              (reconcile/reconcile! ds (constantly model))
              (let [names (filter #(= "name" (:doc_type %)) (docs-for ds "table" table-id))]
                (is (= 1 (count names)))
                (is (= "Sales Orders" (:doc_text (first names))))
                (is (not= old-name-id (:doc_id (first names)))))))
          (testing "unpublishing the table removes it from the library, GCing all its docs"
            (t2/update! :model/Table table-id {:is_published false})
            (reconcile/reconcile! ds (constantly model))
            (is (empty? (docs-for ds "table" table-id)))
            (is (seq (docs-for ds "metric" metric-id)) "the metric is untouched")))))))

(deftest ^:synchronized reconcile!-runs-to-completion-test
  (testing "reconcile! blocks until the run completes and a second run is idempotent"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{data :data}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id}    {}
                           :model/Table    {table-id :id} {:db_id         db-id
                                                           :collection_id (:id data)
                                                           :is_published  true
                                                           :active        true
                                                           :name          "orders"
                                                           :display_name  "Orders"}]
              (testing "the run returns the diff and populates the index"
                (let [result (reconcile/reconcile! ds (constantly model))]
                  (is (pos? (:inserted result)))
                  (is (seq (docs-for ds "table" table-id)))))
              (testing "a second run writes nothing"
                (is (=? {:inserted 0 :deleted 0} (reconcile/reconcile! ds (constantly model))))))))))))

(deftest ^:synchronized rebuild-on-model-change-test
  (mt/with-premium-features #{:library :library-retrieval}
    (with-isolated-index [ds]
      (let [model semantic.tu/mock-embedding-model]
        (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                       :model/Collection {data-id :id} {:type "library-data" :location (str "/" lib-id "/")}
                       :model/Database   {db-id :id}    {}
                       :model/Table      {table-id :id} {:db_id db-id :collection_id data-id
                                                         :is_published true :active true
                                                         :name "orders" :display_name "Orders"}]
          (testing "populate the index under the original model"
            (reconcile/reconcile! ds (constantly model))
            (is (seq (docs-for ds "table" table-id)))
            (is (some? (reconciled-at! ds)) "a converged reconcile stamps reconciled_at"))
          (testing "a model-identity change drops the vectors table and the next run re-embeds everything"
            (let [new-model (semantic.tu/resolved-mock-embedding-model :model-name "model-v2")]
              (is (= :rebuilt (index-table/ensure-tables! ds new-model)))
              (is (= [] (index-rows ds)))
              (is (nil? (reconciled-at! ds))
                  "the rebuild clears reconciled_at, so NLQ staleness can't read the empty index as fresh")
              (reconcile/reconcile! ds (constantly new-model))
              (is (seq (docs-for ds "table" table-id)))
              (testing "a schema-version mismatch alone also triggers the rebuild"
                (jdbc/execute! ds [(format "UPDATE \"%s\" SET schema_version = schema_version - 1"
                                           (index-table/meta-table))])
                (is (= :rebuilt (index-table/ensure-tables! ds new-model)))
                (is (= [] (index-rows ds))))
              (testing "the rebuild heals the meta row, so it doesn't recur on the next sync"
                (is (= :ok (index-table/ensure-tables! ds new-model)))))))))))

(deftest ^:synchronized embedding-space-change-rebuilds-test
  (with-isolated-index [ds]
    (let [model         semantic.tu/mock-embedding-model
          changed-space (update model :embedding-space-id str "-changed")]
      (is (= :created (index-table/ensure-tables! ds model)))
      (jdbc/execute! ds [(format (str "INSERT INTO \"%s\" "
                                      "(doc_id, entity_type, entity_local_id, doc_type, doc_text, doc_embedding) "
                                      "VALUES ('sentinel', 'table', 1, 'name', 'sentinel', '[0,0,0,0]')")
                                 (index-table/vectors-table))])
      (testing "the same provider/name/dimensions with a different immutable space is incompatible"
        (is (= :incompatible (index-table/index-status ds changed-space)))
        (is (= :rebuilt (index-table/ensure-tables! ds changed-space)))
        (is (empty? (index-rows ds))))
      (testing "the rebuilt identity is stable"
        (is (= :compatible (index-table/index-status ds changed-space)))
        (is (= :ok (index-table/ensure-tables! ds changed-space)))))))

(deftest ^:synchronized version-1-meta-upgrade-rebuilds-test
  (with-isolated-index [ds]
    (let [model semantic.tu/mock-embedding-model]
      (jdbc/execute! ds [(format (str "CREATE TABLE \"%s\" ("
                                      "id smallint PRIMARY KEY, provider text NOT NULL, model_name text NOT NULL, "
                                      "vector_dimensions int NOT NULL, schema_version int NOT NULL, "
                                      "updated_at timestamptz NOT NULL)")
                                 (index-table/meta-table))])
      (jdbc/execute! ds [(format (str "INSERT INTO \"%s\" "
                                      "(id, provider, model_name, vector_dimensions, schema_version, updated_at) "
                                      "VALUES (1, 'mock', 'model', 4, 1, NOW())")
                                 (index-table/meta-table))])
      (jdbc/execute! ds [(format "CREATE TABLE \"%s\" (sentinel int)" (index-table/vectors-table))])
      (jdbc/execute! ds [(format "INSERT INTO \"%s\" VALUES (1)" (index-table/vectors-table))])
      (testing "a legacy table is rebuilt once rather than relabeled as the resolved space"
        (is (= :rebuilt (index-table/ensure-tables! ds model)))
        (is (empty? (index-rows ds))))
      (let [meta-row   (jdbc/execute-one! ds
                                          [(format (str "SELECT embedding_space_id, schema_version "
                                                        "FROM \"%s\" WHERE id = 1")
                                                   (index-table/meta-table))]
                                          {:builder-fn jdbc.rs/as-unqualified-lower-maps})
            column-row (jdbc/execute-one! ds
                                          ["SELECT is_nullable FROM information_schema.columns WHERE table_name = ? AND column_name = 'embedding_space_id'"
                                           (index-table/meta-table)]
                                          {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
        (is (= {:embedding_space_id (:embedding-space-id model)
                :schema_version     index-table/schema-version}
               meta-row))
        (is (= "NO" (:is_nullable column-row))))
      (let [execute!    jdbc/execute!
            statements (atom [])]
        (with-redefs [jdbc/execute! (fn [connectable sql-params & opts]
                                      (swap! statements conj (first sql-params))
                                      (apply execute! connectable sql-params opts))]
          (is (= :ok (index-table/ensure-tables! ds model))))
        (is (not-any? #(re-find #"ALTER COLUMN embedding_space_id SET NOT NULL" (str %)) @statements)
            "steady-state reconcile does not reacquire an ACCESS EXCLUSIVE lock"))
      (testing "a manually nullable metadata column is healed once"
        (jdbc/execute! ds [(format "ALTER TABLE \"%s\" ALTER COLUMN embedding_space_id DROP NOT NULL"
                                   (index-table/meta-table))])
        (is (= :ok (index-table/ensure-tables! ds model)))
        (is (= "NO" (:is_nullable
                     (jdbc/execute-one!
                      ds
                      ["SELECT is_nullable FROM information_schema.columns WHERE table_name = ? AND column_name = 'embedding_space_id'"
                       (index-table/meta-table)]
                      {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))))))

(deftest ^:synchronized measures-and-segments-indexed-and-hydrated-test
  (testing "measures/segments on a published library table are indexed and hydrate with parent-table context"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (let [model  semantic.tu/mock-embedding-model
              orders (mt/id :orders)
              total  (mt/id :orders :total)]
          (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                         :model/Collection {data-id :id} {:type "library-data" :location (str "/" lib-id "/")}
                         :model/Measure {measure-id :id} {:name "Order Revenue" :description "sum of order totals"
                                                          :table_id orders :creator_id (mt/user->id :crowberto)
                                                          :definition (measures.tu/measure-definition orders total)}
                         :model/Segment {segment-id :id} {:name "Big Orders" :description "totals over 100"
                                                          :table_id orders
                                                          :definition (measures.tu/segment-definition orders total 100)}]
            ;; publish the (real, fielded) orders table into the library for the duration of the test
            (mt/with-temp-vals-in-db :model/Table orders {:collection_id data-id :is_published true}
              (reconcile/reconcile! ds (constantly model))
              (testing "both are indexed with name + description docs"
                (is (= {"name" 1 "description" 1}
                       (frequencies (map :doc_type (docs-for ds "measure" measure-id)))))
                (is (= {"name" 1 "description" 1}
                       (frequencies (map :doc_type (docs-for ds "segment" segment-id))))))
              (testing "the tool hydrates them as first-class results carrying parent-table context"
                (mt/with-test-user :crowberto
                  (let [by-key (into {} (map (juxt (juxt :type :id) identity))
                                     (tools.search/entity-refs->search-results
                                      [{:model "measure" :id measure-id} {:model "segment" :id segment-id}]))]
                    ;; portable_entity_id (the NanoID) lets the agent reference the measure/segment in a
                    ;; [measure|segment, {}, <id>] clause, the way a metric carries its own.
                    (is (=? {:type "measure" :id measure-id :name "Order Revenue"
                             :database_id (mt/id) :base_table_id orders :portable_entity_id string?}
                            (get by-key ["measure" measure-id])))
                    (is (=? {:type "segment" :id segment-id :name "Big Orders"
                             :database_id (mt/id) :base_table_id orders :portable_entity_id string?}
                            (get by-key ["segment" segment-id])))))))))))))

(deftest ^:synchronized failed-insert-spares-only-that-entitys-orphans-test
  (testing "a failed insert spares that entity's orphans; an unrelated entity's orphans still GC"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (let [model semantic.tu/mock-embedding-model]
          (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                         :model/Collection {data-id :id} {:type "library-data" :location (str "/" lib-id "/")}
                         :model/Database   {db-id :id}    {}
                         :model/Table {edited :id}  {:db_id db-id :collection_id data-id :is_published true
                                                     :active true :name "a" :display_name "Edited Orig"}
                         :model/Table {leaving :id} {:db_id db-id :collection_id data-id :is_published true
                                                     :active true :name "b" :display_name "Leaving"}]
            (reconcile/reconcile! ds (constantly model))
            ;; `edited` is renamed (old name doc -> orphan, new name doc -> to-insert);
            ;; `leaving` is unpublished (its docs -> orphans, with nothing in to-insert).
            (t2/update! :model/Table edited {:display_name "Edited New"})
            (t2/update! :model/Table leaving {:is_published false})
            ;; force the insert of the only to-insert batch (edited's new name doc) to fail.
            (mt/with-dynamic-fn-redefs [reconcile/insert-batch! (fn [& _] (throw (ex-info "boom" {})))]
              (reconcile/reconcile! ds (constantly model)))
            (testing "the edited entity's stale orphan is retained (its replacement insert failed)"
              (is (= #{"Edited Orig"} (set (map :doc_text (docs-for ds "table" edited))))))
            (testing "the entity that left the library is still GC'd (no failed insert of its own)"
              (is (empty? (docs-for ds "table" leaving))))))))))

(deftest ^:synchronized malformed-ai-context-degrades-to-name-and-description-test
  (testing "an unusable ai_context costs the entity its enrichment, not its place in the index: it stays
           findable by name and description, and the enrichment docs it can no longer justify GC"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{data :data}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id} {}
                           :model/Table {bad-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                      :active true :name "bad" :display_name "Bad"
                                                      :description "old description"}
                           :model/Table {good-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                       :active true :name "good" :display_name "Good"}
                           :model/OsiAiContext _ {:entity_type "table" :entity_local_id bad-id
                                                  :ai_context {:synonyms ["kept synonym"]}}]
              (reconcile/reconcile! ds (constantly model))
              (is (contains? (set (map :doc_text (docs-for ds "table" bad-id))) "kept synonym")
                  "baseline: the synonym is indexed while the context is readable")
              (t2/update! :model/Table good-id {:display_name "Good Renamed"})
              (doseq [corrupt-value ["{not-json" "null"]]
                (t2/query-one {:update :osi_ai_context
                               :set    {:ai_context corrupt-value}
                               :where  [:and [:= :entity_type "table"] [:= :entity_local_id bad-id]]})
                (let [result (reconcile/reconcile! ds (constantly model))]
                  (is (= 1 (:degraded result))
                      "the entity is counted for the gauge, which is the signal a person has to act on")
                  (is (= {"name" 1 "description" 1}
                         (frequencies (map :doc_type (docs-for ds "table" bad-id))))
                      "parse-invalid and shape-invalid contexts both degrade to the base docs")))
              (testing "a recoverable legacy row (over-cap instructions + unknown key) rebuilds its slice"
                (t2/query-one {:update :osi_ai_context
                               :set    {:ai_context (json/encode
                                                     {:instructions (apply str (repeat (inc entity-retrieval/max-instructions-len) "x"))
                                                      :future-key   "ignored"
                                                      :synonyms     ["legacy synonym"]})}
                               :where  [:and [:= :entity_type "table"] [:= :entity_local_id bad-id]]})
                (is (map? (reconcile/reconcile! ds (constantly model))))
                (is (= {"name" 1 "description" 1 "synonym" 1}
                       (frequencies (map :doc_type (docs-for ds "table" bad-id)))))
                (is (contains? (set (map :doc_text (docs-for ds "table" bad-id))) "legacy synonym")
                    "the fresh synonym is indexed, not the retained stale one"))
              (is (= #{"Good Renamed"}
                     (set (map :doc_text (filter #(= "name" (:doc_type %))
                                                 (docs-for ds "table" good-id)))))
                  "the healthy entity still reconciles"))))))))

(deftest ^:synchronized data-defect-does-not-block-the-watermark-test
  (testing "an unusable ai_context stays unusable until a person repairs the row, so freezing freshness on
           it would report the index as stale forever while every reconcile was doing all it can. The
           entity is indexed from its name and description, so nothing about naming has gone undetected."
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{data :data}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id} {}
                           :model/Table {table-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                        :active true :name "orders" :display_name "Orders"}
                           :model/OsiAiContext _ {:entity_type "table" :entity_local_id table-id
                                                  :ai_context {:synonyms ["sales"]}}]
              (reconcile/reconcile! ds (constantly model))
              (let [converged (reconciled-at! ds)]
                (is (some? converged) "a clean run stamps the watermark")
                (t2/query-one {:update :osi_ai_context
                               :set    {:ai_context "{not-json"}
                               :where  [:and [:= :entity_type "table"] [:= :entity_local_id table-id]]})
                (is (= 1 (:degraded (reconcile/reconcile! ds (constantly model)))))
                (is (not= converged (reconciled-at! ds))
                    "the run converged on everything it could, so freshness advances")))))))))

(deftest ^:synchronized unforeseen-projection-failure-blocks-the-watermark-test
  (testing "an unforeseen projection error may well be gone next run and leaves the entity's stale docs in
           place meanwhile, so it freezes reconciled_at the way a failed insert does"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{data :data}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id} {}
                           :model/Table {table-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                        :active true :name "orders" :display_name "Orders"}
                           :model/OsiAiContext _ {:entity_type "table" :entity_local_id table-id
                                                  :ai_context {:synonyms ["sales"]}}]
              (reconcile/reconcile! ds (constantly model))
              (let [converged (reconciled-at! ds)]
                (is (some? converged) "a clean run stamps the watermark")
                (mt/with-dynamic-fn-redefs [spec/library-index-docs (fn [& _] (throw (ex-info "boom" {})))]
                  (is (map? (reconcile/reconcile! ds (constantly model))))
                  (is (= converged (reconciled-at! ds))
                      "the entity's docs are stale and a retry might fix it — the watermark must not move"))
                (is (map? (reconcile/reconcile! ds (constantly model))))
                (is (not= converged (reconciled-at! ds))
                    "once the error clears, the next converged run advances the watermark")))))))))

(deftest ^:synchronized reconcile-entity!-targets-one-slice-test
  (testing "reconcile-entity! reconciles only the given entity's docs, leaving other entities untouched"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{data :data}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id} {}
                           :model/Table {a-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "a" :display_name "Orders"
                                                    :description "all orders"}
                           :model/Table {b-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "b" :display_name "Customers"}]
              (reconcile/reconcile! ds (constantly model))
              (let [b-before (set (map :doc_id (docs-for ds "table" b-id)))]
                (testing "adding ai_context to A then reconciling only A inserts A's synonym, leaves B alone"
                  (mt/with-temp [:model/OsiAiContext _ {:entity_type "table" :entity_local_id a-id
                                                        :ai_context {:synonyms ["sales"]}}]
                    (is (=? {:inserted 1 :deleted 0}
                            (reconcile/reconcile-entity! ds (constantly model) "table" a-id)))
                    (is (= {"name" 1 "description" 1 "synonym" 1}
                           (frequencies (map :doc_type (docs-for ds "table" a-id)))))
                    (is (= b-before (set (map :doc_id (docs-for ds "table" b-id)))) "B untouched")))))))))))

(deftest ^:synchronized reconcile-entity!-leaving-library-deletes-all-test
  (testing "reconcile-entity! on an entity that has left the library GCs all of its docs"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{data :data}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id} {}
                           :model/Table {a-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "a" :display_name "Orders"}
                           :model/Table {b-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "b" :display_name "Customers"}]
              (reconcile/reconcile! ds (constantly model))
              (is (seq (docs-for ds "table" a-id)))
              (let [b-before (set (map :doc_id (docs-for ds "table" b-id)))]
                (mt/with-temp-vals-in-db :model/Table a-id {:is_published false}
                  (is (=? {:inserted 0} (reconcile/reconcile-entity! ds (constantly model) "table" a-id)))
                  (is (empty? (docs-for ds "table" a-id)) "A (no longer a member) is GC'd")
                  (is (= b-before (set (map :doc_id (docs-for ds "table" b-id)))) "B untouched"))))))))))

(deftest ^:synchronized reconcile-entity!-ai-context-removal-keeps-name-test
  (testing "removing an entity's ai_context and reconciling it GCs synonym/example docs but keeps name/description"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{data :data}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id} {}
                           :model/Table {a-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "a" :display_name "Orders"
                                                    :description "all orders"}
                           :model/OsiAiContext _ {:entity_type "table" :entity_local_id a-id
                                                  :ai_context {:synonyms ["sales" "revenue"]}}]
              (reconcile/reconcile! ds (constantly model))
              (is (= {"name" 1 "description" 1 "synonym" 2}
                     (frequencies (map :doc_type (docs-for ds "table" a-id)))))
              (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id a-id)
              (is (=? {:inserted 0 :deleted 2} (reconcile/reconcile-entity! ds (constantly model) "table" a-id)))
              (is (= {"name" 1 "description" 1} (frequencies (map :doc_type (docs-for ds "table" a-id))))
                  "the synonym docs are GC'd; name + description remain"))))))))

(deftest ^:synchronized reconcile!-keeps-ai-context-across-a-card-type-flip-test
  (testing "a full reconcile matches ai_context by entity class, so relabelling a card keeps its synonyms"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{metrics :metrics}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id} {}
                           :model/Card {card-id :id} {:type "metric" :collection_id (:id metrics)
                                                      :name "Revenue" :database_id db-id}
                           ;; ai_context curated while the card was a metric (stored under entity_type "metric")
                           :model/OsiAiContext _ {:entity_type "metric" :entity_local_id card-id
                                                  :ai_context {:synonyms ["sales" "turnover"]}}]
              (reconcile/reconcile! ds (constantly model))
              (is (= {"name" 1 "synonym" 2} (frequencies (map :doc_type (docs-for ds "metric" card-id))))
                  "indexed under metric with both curated synonyms")
              (testing "relabelling the card a model re-keys its docs but the curated synonyms survive"
                (mt/with-temp-vals-in-db :model/Card card-id {:type "model"}
                  (reconcile/reconcile! ds (constantly model))
                  (is (empty? (docs-for ds "metric" card-id)) "stale metric-typed docs are GC'd")
                  (is (= {"name" 1 "synonym" 2} (frequencies (map :doc_type (docs-for ds "model" card-id))))
                      "the ai_context (stored under metric) is matched by class and kept, re-keyed under model"))))))))))

(deftest ^:synchronized library-entity-matches-library-entities-test
  (testing "library-entity (point lookup) agrees with library-entities (full scan) for members and non-members"
    (mt/with-premium-features #{:library :library-retrieval}
      (collections.tu/with-library [{data :data metrics :metrics}]
        (mt/with-temp [:model/Database {db-id :id} {}
                       :model/Table {tbl :id}      {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "t" :display_name "T"}
                       :model/Card  {metric :id}   {:type "metric" :collection_id (:id metrics)
                                                    :name "M" :database_id db-id}
                       :model/Table {unpub :id}    {:db_id db-id :collection_id (:id data) :is_published false
                                                    :active true :name "u"}
                       :model/Card  {archived :id} {:type "metric" :collection_id (:id metrics) :archived true
                                                    :name "A" :database_id db-id}]
          (let [by-key (into {} (map (juxt (juxt :entity_type :entity_local_id) identity))
                             (map spec/entity-summary (spec/member-entities :library-index)))]
            (testing "members resolve and match the full-scan entry"
              (is (= (get by-key ["table" tbl])   (reconcile/library-entity "table" tbl)))
              (is (= (get by-key ["metric" metric]) (reconcile/library-entity "metric" metric))))
            (testing "non-members resolve to nil"
              (is (nil? (reconcile/library-entity "table" unpub)))
              (is (nil? (reconcile/library-entity "metric" archived))))))))))

(deftest ^:synchronized reconcile-entity!-on-first-build-repopulates-whole-library-test
  (testing "a targeted reconcile that creates the index (first caller, empty table) repopulates the whole library"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{data :data}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id} {}
                           :model/Table {a-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "a" :display_name "Orders"}
                           :model/Table {b-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "b" :display_name "Customers"}]
              ;; No prior reconcile! — reconcile-entity! is the first caller, so ensure-tables! returns :created
              ;; (empty table). It must repopulate the whole library, not index only the one dirty entity.
              (reconcile/reconcile-entity! ds (constantly model) "table" a-id)
              (is (seq (docs-for ds "table" a-id)) "A indexed")
              (is (seq (docs-for ds "table" b-id))
                  "B indexed too: the empty-index build escalated to a full repopulate"))))))))

(deftest ^:synchronized reconcile-entity!-on-rebuild-repopulates-whole-library-test
  (testing "a targeted reconcile that triggers a model/format rebuild repopulates the whole library, not just the one entity"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-isolated-index [ds]
        (collections.tu/with-library [{data :data}]
          (let [model semantic.tu/mock-embedding-model]
            (mt/with-temp [:model/Database {db-id :id} {}
                           :model/Table {a-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "a" :display_name "Orders"}
                           :model/Table {b-id :id} {:db_id db-id :collection_id (:id data) :is_published true
                                                    :active true :name "b" :display_name "Customers"}]
              (reconcile/reconcile! ds (constantly model))
              (is (seq (docs-for ds "table" a-id)))
              (is (seq (docs-for ds "table" b-id)))
              ;; a targeted reconcile of A under a new model identity forces ensure-tables! to rebuild (empty);
              ;; it must repopulate B too, not leave it missing until the periodic backstop.
              (let [new-model (semantic.tu/resolved-mock-embedding-model :model-name "model-v2")]
                (is (:rebuilt? (reconcile/reconcile-entity! ds (constantly new-model) "table" a-id)))
                (is (seq (docs-for ds "table" a-id)) "A repopulated after the rebuild")
                (is (seq (docs-for ds "table" b-id)) "B repopulated too (not dropped by the rebuild)")))))))))
