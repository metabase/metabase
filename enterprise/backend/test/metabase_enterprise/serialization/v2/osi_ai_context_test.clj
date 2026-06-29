(ns metabase-enterprise.serialization.v2.osi-ai-context-test
  "Round-trip serialization tests for `:model/OsiAiContext`, whose `entity_local_id` column holds a
  polymorphic reference (dispatched on `entity_type`) that must survive export and import."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase-enterprise.serialization.v2.storage.files :as storage.files]
   [metabase.measures.test-util :as measures.tu]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouses.models.database :as models.database]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; The references point at the H2 test-data Table, so keep the H2 guard off and re-enable H2 in extract.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each (fn [thunk]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)
                                                  models.database/assert-not-h2! (constantly nil)]
                        (binding [models.database/*include-h2-in-extract?* true]
                          (thunk)))))

(defn- no-labels [path]
  (mapv #(dissoc % :label) path))

(defn- ingestion-in-memory [extractions]
  (let [mapped (into {} (for [entity (vec extractions)]
                          [(no-labels (serdes/path entity)) entity]))]
    (reify serdes.ingest/Ingestable
      (ingest-list [_] (keys mapped))
      (ingest-one [_ path] (get mapped (no-labels path)))
      (ingest-errors [_] []))))

(deftest card-backed-entity-round-trip-test
  (testing "every card-backed entity type stores as the canonical \"card\", exports as the Card's entity_id, and imports back"
    (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} {}]
      (doseq [entity-type ["card" "model" "metric" "question"]]
        (testing entity-type
          (mt/with-temp [:model/OsiAiContext {sli-id :id sli-eid :entity_id}
                         {:ai_context      {:instructions "Use it directly." :synonyms [entity-type]}
                          :entity_type     entity-type
                          :entity_local_id card-id}]
            (let [extracted (ts/extract-one "OsiAiContext" sli-id)]
              (testing "entity_local_id is exported as a portable reference; the type is normalized to \"card\""
                (is (=? {:entity_id       sli-eid
                         :ai_context      {:instructions "Use it directly." :synonyms [entity-type]}
                         :entity_type     "card"
                         :entity_local_id card-eid}
                        extracted)))
              (testing "dependencies cover the referenced Card"
                (is (= #{[{:model "Card" :id card-eid}]}
                       (serdes/dependencies extracted))))
              (testing "importing resolves the ref back to the local id"
                (t2/delete! :model/OsiAiContext :id sli-id)
                (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
                (is (=? {:entity_type "card" :entity_local_id card-id}
                        (t2/select-one :model/OsiAiContext :entity_id sli-eid)))
                ;; load-metabase! re-inserts under a new id that with-temp can't reap; clean it up so the
                ;; row doesn't leak into other tests' view of the (small, fully-scanned) table.
                (t2/delete! :model/OsiAiContext :entity_id sli-eid)))))))))

(deftest measure-segment-entity-round-trip-test
  (testing "measure and segment entity refs export as the entity's entity_id and import back"
    (let [orders (mt/id :orders)
          total  (mt/id :orders :total)]
      (mt/with-temp [:model/Measure {measure-id :id measure-eid :entity_id}
                     {:name "M" :table_id orders :creator_id (mt/user->id :crowberto)
                      :definition (measures.tu/measure-definition orders total)}
                     :model/Segment {segment-id :id segment-eid :entity_id}
                     {:name "S" :table_id orders :definition (measures.tu/segment-definition orders total 100)}]
        (doseq [[entity-type id eid serdes-model] [["measure" measure-id measure-eid "Measure"]
                                                   ["segment" segment-id segment-eid "Segment"]]]
          (testing entity-type
            (mt/with-temp [:model/OsiAiContext {sli-id :id sli-eid :entity_id}
                           {:ai_context {:synonyms [entity-type]} :entity_type entity-type :entity_local_id id}]
              (let [extracted (ts/extract-one "OsiAiContext" sli-id)]
                (testing "entity_local_id is exported as a portable entity_id reference"
                  (is (=? {:entity_type entity-type :entity_local_id eid} extracted)))
                (testing "dependencies cover the referenced entity (not a Card)"
                  (is (= #{[{:model serdes-model :id eid}]}
                         (serdes/dependencies extracted))))
                (testing "importing resolves the ref back to the local id"
                  (t2/delete! :model/OsiAiContext :id sli-id)
                  (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
                  (is (=? {:entity_type entity-type :entity_local_id id}
                          (t2/select-one :model/OsiAiContext :entity_id sli-eid)))
                  (t2/delete! :model/OsiAiContext :entity_id sli-eid))))))))))

(deftest unmapped-entity-type-passes-through-test
  (testing "an unrecognized entity_type exports as-is (raw id, no deps) instead of aborting the export"
    ;; The CRUD API rejects unknown types, but rows written before a type was retired (or by direct appdb
    ;; writes) shouldn't take down a whole export.
    (mt/with-temp [:model/OsiAiContext {sli-id :id}
                   {:ai_context {:instructions "legacy"} :entity_type "garbage" :entity_local_id 5}]
      (let [extracted (ts/extract-one "OsiAiContext" sli-id)]
        (is (=? {:entity_type "garbage" :entity_local_id 5} extracted))
        (is (= #{} (serdes/dependencies extracted)))))))

(deftest table-entity-round-trip-test
  (let [table-id (mt/id :venues)]
    (mt/with-temp [:model/OsiAiContext {sli-id :id sli-eid :entity_id}
                   {:ai_context {:instructions "best venues"} :entity_type "table" :entity_local_id table-id}]
      (let [extracted (ts/extract-one "OsiAiContext" sli-id)
            table-ref (:entity_local_id extracted)]
        (testing "entity_local_id is exported as a [db schema table] path"
          (is (=? {:entity_id sli-eid :entity_type "table" :entity_local_id vector?} extracted))
          (is (= ["VENUES"] (take-last 1 table-ref))))
        (testing "dependencies cover the Table's Database (the Table is synthesized on import)"
          (is (= #{[{:model "Database" :id (first table-ref)}]}
                 (serdes/dependencies extracted))))
        (testing "importing resolves the ref back to the local id"
          (t2/delete! :model/OsiAiContext :id sli-id)
          (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
          (is (=? {:entity_type "table" :entity_local_id table-id}
                  (t2/select-one :model/OsiAiContext :entity_id sli-eid)))
          ;; load-metabase! re-inserts under a new id that with-temp can't reap; clean it up so the row
          ;; doesn't leak into other tests' view of the (small, fully-scanned) table.
          (t2/delete! :model/OsiAiContext :entity_id sli-eid))))))

(deftest import-over-existing-natural-key-row-test
  (testing "importing over a local row for the same (entity_type, entity_local_id) but a different entity_id updates in place"
    ;; Reproduces the unique-constraint hazard: source and destination independently created ai_context for the
    ;; same Card, each minting its own entity_id. The default entity_id-keyed lookup misses the local row, so without
    ;; the natural-key load-one! override the import INSERTs and violates uq_osi_ai_context_entity.
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/OsiAiContext {local-id :id local-eid :entity_id}
                   {:ai_context {:instructions "destination's own copy"}
                    :entity_type "card" :entity_local_id card-id}]
      (let [source-eid (u/generate-nano-id)
            ;; an incoming export for the SAME card but a different (source-minted) entity_id
            extracted  (-> (ts/extract-one "OsiAiContext" local-id)
                           (assoc :entity_id source-eid)
                           (assoc-in [:serdes/meta 0 :id] source-eid)
                           (assoc :ai_context {:instructions "source guidance"}))]
        (is (not= local-eid (:entity_id extracted)))
        (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
        (testing "still exactly one row for this entity, updated in place (not a duplicate insert)"
          (is (= 1 (t2/count :model/OsiAiContext :entity_type "card" :entity_local_id card-id))))
        (testing "the existing row's ai_context was replaced"
          (is (=? {:id          local-id
                   :entity_type "card"
                   :entity_local_id card-id
                   :ai_context  {:instructions "source guidance"}}
                  (t2/select-one :model/OsiAiContext :entity_type "card" :entity_local_id card-id))))
        ;; the in-place update swapped local-id's entity_id, so with-temp's entity_id-keyed reap would miss it;
        ;; delete by natural key so the row doesn't leak into other tests' view of the fully-scanned table.
        (t2/delete! :model/OsiAiContext :entity_type "card" :entity_local_id card-id)))))

(deftest import-repoints-row-to-a-different-entity-test
  (testing "an import whose portable ref resolves to a different entity repairs the binding instead of aborting"
    ;; The immutable-binding before-update hook rejects a changed entity_local_id (right for the CRUD API), but
    ;; serdes legitimately re-resolves a row's ref to a new local entity (e.g. re-import after the target was
    ;; recreated). load-update! must delete + reinsert in that case rather than t2/update! the binding.
    (mt/with-temp [:model/Card {card-a :id} {}
                   :model/Card {card-b :id card-b-eid :entity_id} {}
                   :model/OsiAiContext {local-id :id local-eid :entity_id}
                   {:ai_context {:instructions "bound to A"} :entity_type "card" :entity_local_id card-a}]
      ;; same serdes entity_id, but the portable ref now points at Card B
      (let [extracted (-> (ts/extract-one "OsiAiContext" local-id)
                          (assoc :entity_local_id card-b-eid)
                          (assoc :ai_context {:instructions "now bound to B"}))]
        (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
        (testing "still one row for this entity_id, now bound to Card B"
          (is (= 1 (t2/count :model/OsiAiContext :entity_id local-eid)))
          (is (=? {:entity_type "card" :entity_local_id card-b :ai_context {:instructions "now bound to B"}}
                  (t2/select-one :model/OsiAiContext :entity_id local-eid))))
        (testing "the stale binding to Card A is gone"
          (is (nil? (t2/select-one :model/OsiAiContext :entity_type "card" :entity_local_id card-a))))
        ;; reinsert minted a new local id with the same entity_id; reap by entity_id so it doesn't leak.
        (t2/delete! :model/OsiAiContext :entity_id local-eid)))))

(deftest disk-export-import-round-trip-test
  (testing "OsiAiContext survives a real on-disk export/import"
    ;; The in-memory tests above skip two layers that have silently dropped the model before:
    ;; `extract/model-set` (the default-export selection) and `ingest/legal-top-level-paths` (which
    ;; dirs the importer reads). This drives both through actual YAML on disk.
    (let [serialized (atom nil)
          sli-eid    (atom nil)]
      (ts/with-dbs [source-db dest-db]
        (ts/with-db source-db
          (let [db  (ts/create! :model/Database :name "Prompt DB")
                t1  (ts/create! :model/Table :name "ORDERS" :db_id (:id db) :schema "PUBLIC")
                sli (ts/create! :model/OsiAiContext
                                :ai_context {:instructions "orders guidance"}
                                :entity_type "table" :entity_local_id (:id t1))]
            (reset! sli-eid (:entity_id sli))
            ;; realize inside with-cache so the cached resolvers are actually used during extraction
            (reset! serialized (serdes/with-cache (into [] (extract/extract {}))))))
        (testing "default export selection includes it (guards extract/model-set)"
          (is (= 1 (count (filter (fn [{[{:keys [model]}] :serdes/meta}]
                                    (= model "OsiAiContext"))
                                  @serialized)))))
        (ts/with-random-dump-dir [dump-dir "sli-serdes-"]
          (storage/store! (seq @serialized) (storage.files/file-writer dump-dir))
          (testing "stored under the osi_ai_context/ directory"
            (is (.exists (io/file dump-dir "osi_ai_context"))))
          (testing "ingest reads it back (guards ingest/legal-top-level-paths)"
            (is (contains? (set (serdes.ingest/ingest-list (serdes.ingest/ingest-yaml dump-dir)))
                           [{:model "OsiAiContext" :id @sli-eid}])))
          (testing "loads into a fresh appdb with the table ref resolved"
            (ts/with-db dest-db
              (serdes/with-cache (serdes.load/load-metabase! (serdes.ingest/ingest-yaml dump-dir)))
              (let [row (t2/select-one :model/OsiAiContext :entity_id @sli-eid)]
                (is (=? {:ai_context {:instructions "orders guidance"}} row))
                (is (= "ORDERS"
                       (t2/select-one-fn :name :model/Table :id (:entity_local_id row))))))))))))
