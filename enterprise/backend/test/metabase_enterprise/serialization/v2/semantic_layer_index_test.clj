(ns metabase-enterprise.serialization.v2.semantic-layer-index-test
  "Round-trip serialization tests for `:model/SemanticLayerIndex`, whose `entities` column holds a
  polymorphic list of Card/Table references that must survive export and import."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase-enterprise.serialization.v2.storage.files :as storage.files]
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

(deftest semantic-layer-index-round-trip-test
  (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} {}]
    (let [table-id (mt/id :venues)
          entities [{:model "card" :id card-id}
                    {:model "table" :id table-id}]]
      (mt/with-temp [:model/SemanticLayerIndex {sli-id :id sli-eid :entity_id}
                     {:search_prompt "best venues" :type :sources :verified true :entities entities
                      :usage_instructions "Prefer the venues table."}]
        (let [extracted (ts/extract-one "SemanticLayerIndex" sli-id)
              [_card-ref table-ref] (:entities extracted)]
          (testing "entity refs are exported as portable references"
            (is (=? {:entity_id          sli-eid
                     :search_prompt      "best venues"
                     :usage_instructions "Prefer the venues table."
                     :type               "sources"
                     :verified           true
                     :entities           [{:model "card"  :id card-eid}
                                          {:model "table" :id vector?}]}
                    extracted))
            (is (= ["VENUES"] (take-last 1 (:id table-ref)))))
          (testing "dependencies cover the referenced Card and the Table's Database"
            (is (= #{[{:model "Card" :id card-eid}]
                     [{:model "Database" :id (first (:id table-ref))}]}
                   (serdes/dependencies extracted))))
          (testing "importing resolves the refs back to local ids"
            (t2/delete! :model/SemanticLayerIndex :id sli-id)
            (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
            (is (= entities
                   (t2/select-one-fn :entities :model/SemanticLayerIndex :entity_id sli-eid)))))))))

(deftest disk-export-import-round-trip-test
  (testing "SemanticLayerIndex survives a real on-disk export/import"
    ;; The in-memory test above skips two layers that have silently dropped the model before:
    ;; `extract/model-set` (the default-export selection) and `ingest/legal-top-level-paths` (which
    ;; dirs the importer reads). This drives both through actual YAML on disk.
    (let [serialized (atom nil)
          sli-eid    (atom nil)]
      (ts/with-dbs [source-db dest-db]
        (ts/with-db source-db
          (let [db  (ts/create! :model/Database :name "Prompt DB")
                t1  (ts/create! :model/Table :name "ORDERS" :db_id (:id db) :schema "PUBLIC")
                t2  (ts/create! :model/Table :name "PEOPLE" :db_id (:id db) :schema "PUBLIC")
                sli (ts/create! :model/SemanticLayerIndex
                                :search_prompt "orders and people" :type :sources :verified true
                                :entities [{:model "table" :id (:id t1)}
                                           {:model "table" :id (:id t2)}])]
            (reset! sli-eid (:entity_id sli))
            ;; realize inside with-cache so the cached resolvers are actually used during extraction
            (reset! serialized (serdes/with-cache (into [] (extract/extract {}))))))
        (testing "default export selection includes it (guards extract/model-set)"
          (is (= 1 (count (filter (fn [{[{:keys [model]}] :serdes/meta}]
                                    (= model "SemanticLayerIndex"))
                                  @serialized)))))
        (ts/with-random-dump-dir [dump-dir "sli-serdes-"]
          (storage/store! (seq @serialized) (storage.files/file-writer dump-dir))
          (testing "stored under the semantic_layer_index/ directory"
            (is (.exists (io/file dump-dir "semantic_layer_index"))))
          (testing "ingest reads it back (guards ingest/legal-top-level-paths)"
            (is (contains? (set (serdes.ingest/ingest-list (serdes.ingest/ingest-yaml dump-dir)))
                           [{:model "SemanticLayerIndex" :id @sli-eid}])))
          (testing "loads into a fresh appdb with table refs resolved"
            (ts/with-db dest-db
              (serdes/with-cache (serdes.load/load-metabase! (serdes.ingest/ingest-yaml dump-dir)))
              (let [row (t2/select-one :model/SemanticLayerIndex :entity_id @sli-eid)]
                (is (=? {:type :sources :verified true} row))
                (is (= #{"ORDERS" "PEOPLE"}
                       (set (t2/select-fn-vec :name :model/Table
                                              :id [:in (map :id (:entities row))]))))))))))))
