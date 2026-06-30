(ns metabase-enterprise.serialization.v2.osi-ai-context-test
  "Round-trip serialization tests for `:model/OsiAiContext`. Identity is the entity it describes: there is no
  entity_id, so serdes nests each row under its entity's portable path (Card/Table/Measure/Segment) and
  resolves the `(entity_type, entity_local_id)` key back from that path on import."
  (:require
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

(defn- extract-for [entity-type entity-local-id]
  (ts/extract-one "OsiAiContext" [:and [:= :entity_type entity-type] [:= :entity_local_id entity-local-id]]))

(defn- self-segment [extracted]
  (last (serdes/path extracted)))

(deftest card-backed-entity-round-trip-test
  (testing "every card-backed entity type stores as \"card\", nests under the Card's path, and imports back"
    (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} {}]
      (doseq [entity-type ["card" "model" "metric" "question"]]
        (testing entity-type
          (mt/with-temp [:model/OsiAiContext _ {:ai_context {:instructions "Use it directly." :synonyms [entity-type]}
                                                :entity_type entity-type :entity_local_id card-id}]
            (let [extracted (extract-for "card" card-id)]
              (testing "path nests the row under the Card; ai_context copies verbatim; no entity_id/key fields"
                (is (=? {:ai_context  {:instructions "Use it directly." :synonyms [entity-type]}
                         :serdes/meta [{:model "Card" :id card-eid} {:model "OsiAiContext" :id "ai_context"}]}
                        extracted))
                (is (not (contains? extracted :entity_id))))
              (testing "depends on the referenced Card"
                (is (= [[{:model "Card" :id card-eid}]] (serdes/dependencies extracted))))
              (testing "importing resolves the path back to the local card row"
                (t2/delete! :model/OsiAiContext :entity_type "card" :entity_local_id card-id)
                (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
                (is (=? {:entity_type "card" :entity_local_id card-id}
                        (t2/select-one :model/OsiAiContext :entity_type "card" :entity_local_id card-id)))))))))))

(deftest measure-segment-entity-round-trip-test
  (testing "measure and segment refs nest under the entity's path and import back"
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
            (mt/with-temp [:model/OsiAiContext _ {:ai_context {:synonyms [entity-type]}
                                                  :entity_type entity-type :entity_local_id id}]
              (let [extracted (extract-for entity-type id)]
                (testing "path nests under the entity"
                  (is (=? {:serdes/meta [{:model serdes-model :id eid} {:model "OsiAiContext" :id "ai_context"}]}
                          extracted)))
                (testing "depends on the referenced entity"
                  (is (= [[{:model serdes-model :id eid}]] (serdes/dependencies extracted))))
                (testing "importing resolves the path back to the local id"
                  (t2/delete! :model/OsiAiContext :entity_type entity-type :entity_local_id id)
                  (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
                  (is (=? {:entity_type entity-type :entity_local_id id}
                          (t2/select-one :model/OsiAiContext :entity_type entity-type :entity_local_id id))))))))))))

(deftest table-entity-round-trip-test
  (let [table-id (mt/id :venues)]
    (mt/with-temp [:model/OsiAiContext _ {:ai_context {:instructions "best venues"}
                                          :entity_type "table" :entity_local_id table-id}]
      (let [extracted (extract-for "table" table-id)]
        (testing "path nests under the Table's [Database Schema Table] path"
          (is (= {:model "OsiAiContext" :id "ai_context"} (self-segment extracted)))
          (is (= "Table" (:model (last (pop (vec (serdes/path extracted))))))))
        (testing "depends on the Table"
          (is (= [(vec (pop (vec (serdes/path extracted))))] (serdes/dependencies extracted))))
        (testing "importing resolves the path back to the local id"
          (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id table-id)
          (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
          (is (=? {:entity_type "table" :entity_local_id table-id}
                  (t2/select-one :model/OsiAiContext :entity_type "table" :entity_local_id table-id))))))))

(deftest osi-ai-context-export-scope-test
  (testing "OsiAiContext exports only on a fully complete export"
    ;; it's extracted unfiltered, so any partial export pulls every ai_context row in the instance (leaked
    ;; curator text + dangling deps); gated until reverse-dep export lands.
    (testing "a complete export (no targets, content + data model) includes it"
      (is (contains? (#'extract/model-set {}) "OsiAiContext")))
    (testing "a targeted/selective export excludes it"
      (is (not (contains? (#'extract/model-set {:targets [["Collection" 1]]}) "OsiAiContext"))))
    (testing "an untargeted-but-partial export excludes it (referenced entities may be absent)"
      (is (not (contains? (#'extract/model-set {:no-collections true}) "OsiAiContext")))
      (is (not (contains? (#'extract/model-set {:no-data-model true}) "OsiAiContext"))))
    (testing "the explicit opt-out excludes it"
      (is (not (contains? (#'extract/model-set {:no-osi-ai-context true}) "OsiAiContext"))))))

(deftest disk-export-import-round-trip-test
  (testing "OsiAiContext survives a real on-disk export/import, nested under its Table"
    ;; Drives extract/model-set (the default-export selection) and ingest/legal-top-level-paths through real YAML.
    (let [serialized (atom nil)]
      (ts/with-dbs [source-db dest-db]
        (ts/with-db source-db
          (let [db (ts/create! :model/Database :name "Prompt DB")
                t1 (ts/create! :model/Table :name "ORDERS" :db_id (:id db) :schema "PUBLIC")]
            (ts/create! :model/OsiAiContext
                        :ai_context {:instructions "orders guidance"}
                        :entity_type "table" :entity_local_id (:id t1))
            (reset! serialized (serdes/with-cache (into [] (extract/extract {}))))))
        (testing "default export selection includes it (guards extract/model-set)"
          ;; the row nests under its Table, so OsiAiContext is the *last* path segment, not the first.
          (is (= 1 (count (filter (fn [e] (= "OsiAiContext" (:model (last (:serdes/meta e)))))
                                  @serialized)))))
        (ts/with-random-dump-dir [dump-dir "sli-serdes-"]
          (storage/store! (seq @serialized) (storage.files/file-writer dump-dir))
          (testing "loads into a fresh appdb with the table ref resolved"
            (ts/with-db dest-db
              (serdes/with-cache (serdes.load/load-metabase! (serdes.ingest/ingest-yaml dump-dir)))
              (let [orders (t2/select-one :model/Table :name "ORDERS")
                    row    (t2/select-one :model/OsiAiContext :entity_type "table" :entity_local_id (:id orders))]
                (is (=? {:ai_context {:instructions "orders guidance"}} row))))))))))
