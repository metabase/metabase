(ns metabase-enterprise.serialization.v2.osi-ai-context-test
  "Round-trip serialization tests for `:model/OsiAiContext`, whose identity is the entity it describes."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase-enterprise.serialization.v2.storage.files :as storage.files]
   [metabase.measures.test-util :as measures.tu]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [metabase.warehouses.models.database :as models.database]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)
                                                  models.database/assert-not-h2! (constantly nil)]
                        (thunk))))

(def ^:private ingestion-in-memory ts/ingestion-in-memory)

(defn- extract-for [entity-type entity-local-id]
  (ts/extract-one "OsiAiContext" [:and [:= :entity_type entity-type] [:= :entity_local_id entity-local-id]]))

(deftest card-backed-entity-round-trip-test
  (testing "every card-backed entity type stores as \"card\", refers to its Card, and imports back"
    (doseq [entity-type ["card" "model" "metric" "question"]]
      (testing entity-type
        ;; a fresh Card per flavor: they all normalize to the same `card` entity_type, so reusing one card
        ;; would collide on the (card, id) primary key across iterations.
        (mt/with-temp [:model/Card     {card-id :id card-eid :entity_id} {}
                       :model/OsiAiContext _ {:ai_context  {:instructions "Use it directly." :synonyms [entity-type]}
                                              :entity_type entity-type :entity_local_id card-id}]
          (let [extracted (extract-for "card" card-id)]
            (testing "refers to Card by its entity id; ai_context and entity_id copy verbatim"
              (is (=? {:ai_context      {:instructions "Use it directly." :synonyms [entity-type]}
                       :entity_id       string?
                       :entity_type     "card"
                       :entity_local_id card-eid
                       :serdes/meta     [{:model "OsiAiContext"}]}
                      extracted)))
            (testing "depends on referenced Card"
              (is (= #{[:model/Card card-eid]} (first (serialization/import-dependencies :model/OsiAiContext [extracted])))))
            (testing "importing resolves reference back to local card row"
              (t2/delete! :model/OsiAiContext :entity_type "card" :entity_local_id card-id)
              (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
              (is (=? {:entity_type "card" :entity_local_id card-id :entity_id (:entity_id extracted)}
                      (t2/select-one :model/OsiAiContext :entity_type "card" :entity_local_id card-id))))))))))

(deftest measure-segment-entity-round-trip-test
  (testing "measure and segment refs refer to their entity and import back"
    (let [orders (mt/id :orders)
          total  (mt/id :orders :total)]
      (mt/with-temp [:model/Measure {measure-id :id measure-eid :entity_id}
                     {:name "M" :table_id orders :creator_id (mt/user->id :crowberto)
                      :definition (measures.tu/measure-definition orders total)}
                     :model/Segment {segment-id :id segment-eid :entity_id}
                     {:name "S" :table_id orders :definition (measures.tu/segment-definition orders total 100)}]
        (doseq [[entity-type id eid model] [["measure" measure-id measure-eid :model/Measure]
                                            ["segment" segment-id segment-eid :model/Segment]]]
          (testing entity-type
            (mt/with-temp [:model/OsiAiContext _ {:ai_context {:synonyms [entity-type]}
                                                  :entity_type entity-type :entity_local_id id}]
              (let [extracted (extract-for entity-type id)]
                (testing "refers to entity by its entity id"
                  (is (=? {:entity_local_id eid :serdes/meta [{:model "OsiAiContext"}]}
                          extracted)))
                (testing "depends on referenced entity"
                  (is (= #{[model eid]} (first (serialization/import-dependencies :model/OsiAiContext [extracted])))))
                (testing "importing resolves reference back to local id"
                  (t2/delete! :model/OsiAiContext :entity_type entity-type :entity_local_id id)
                  (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
                  (is (=? {:entity_type entity-type :entity_local_id id}
                          (t2/select-one :model/OsiAiContext :entity_type entity-type :entity_local_id id))))))))))))

(deftest table-entity-round-trip-test
  (let [table-id (mt/id :venues)]
    (mt/with-temp [:model/OsiAiContext _ {:ai_context {:instructions "best venues"}
                                          :entity_type "table" :entity_local_id table-id}]
      (let [extracted (extract-for "table" table-id)]
        (testing "refers to Table by its [database schema table] reference"
          (is (=? {:entity_type "table" :entity_local_id [string? "PUBLIC" "VENUES"]} extracted)))
        (testing "depends on Table"
          (is (= #{[:model/Table (:entity_local_id extracted)]} (first (serialization/import-dependencies :model/OsiAiContext [extracted])))))
        (testing "importing resolves reference back to local id"
          (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id table-id)
          (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
          (is (=? {:entity_type "table" :entity_local_id table-id}
                  (t2/select-one :model/OsiAiContext :entity_type "table" :entity_local_id table-id))))))))

(deftest schemaless-table-entity-round-trip-test
  (testing "schemaless Table keeps its nil schema in export, so both import paths find Table"
    (mt/with-temp [:model/Table        {table-id :id} {:db_id (mt/id) :schema nil :name "schemaless_table"}
                   :model/OsiAiContext _              {:ai_context {:instructions "no schema"}
                                                       :entity_type "table" :entity_local_id table-id}]
      (let [db-name   (t2/select-one-fn :name :model/Database :id (mt/id))
            extracted (extract-for "table" table-id)
            restored  #(t2/select-one :model/OsiAiContext :entity_type "table" :entity_local_id table-id)]
        (is (= [db-name nil "schemaless_table"] (:entity_local_id extracted)))
        (testing "from in-memory ingestion"
          (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id table-id)
          (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
          (is (=? {:ai_context {:instructions "no schema"}} (restored))))
        (testing "from files"
          (ts/with-random-dump-dir [dump-dir "osi-schemaless-"]
            (storage/store! [extracted] (storage.files/file-writer dump-dir))
            (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id table-id)
            (serdes.load/load-metabase! (serdes.ingest/ingest-yaml dump-dir))
            (is (=? {:ai_context {:instructions "no schema"}} (restored)))))))))

(deftest import-over-existing-row-updates-by-compound-key-test
  (testing "importing over existing row updates it in place via full compound key, not entity_type alone"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/OsiAiContext _ {:entity_type "metric" :entity_local_id card-id
                                          :ai_context {:instructions "v1"}}]
      (let [extracted (assoc-in (extract-for "card" card-id) [:ai_context :instructions] "v2")]
        (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
        (is (= 1 (t2/count :model/OsiAiContext :entity_type "card" :entity_local_id card-id))
            "still one row (updated, not duplicated)")
        (is (=? {:ai_context {:instructions "v2"}}
                (t2/select-one :model/OsiAiContext :entity_type "card" :entity_local_id card-id)))))))

(deftest string-ai-context-import-coerces-to-instructions-test
  (testing "OSI string-shorthand ai_context imports as {:instructions s}, normalized on write"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/OsiAiContext _ {:entity_type "metric" :entity_local_id card-id
                                          :ai_context {:instructions "object form"}}]
      (let [extracted (assoc (extract-for "card" card-id) :ai_context "just the instructions")]
        (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
        (is (=? {:ai_context {:instructions "just the instructions"}}
                (t2/select-one :model/OsiAiContext :entity_type "card" :entity_local_id card-id)))))))

(deftest disk-round-trip-card-context-test
  (testing "card-backed ai_context survives real on-disk store/ingest/load"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/OsiAiContext _ {:entity_type "metric" :entity_local_id card-id
                                          :ai_context {:instructions "card guidance"}}]
      (let [extracted (extract-for "card" card-id)]
        (ts/with-random-dump-dir [dump-dir "osi-card-"]
          (storage/store! [extracted] (storage.files/file-writer dump-dir))
          (t2/delete! :model/OsiAiContext :entity_type "card" :entity_local_id card-id)
          (serdes.load/load-metabase! (serdes.ingest/ingest-yaml dump-dir))
          (is (=? {:ai_context {:instructions "card guidance"}}
                  (t2/select-one :model/OsiAiContext :entity_type "card" :entity_local_id card-id))))))))

(deftest osi-ai-context-excluded-from-default-export-test
  (testing "OsiAiContext is kept out of the default export set"
    (is (not (contains? (#'extract/model-set {}) :model/OsiAiContext)))
    (is (not (contains? (#'extract/model-set {:targets [[:model/Collection 1]]}) :model/OsiAiContext)))))

(deftest excluded-from-default-disk-export-test
  (testing "real default export omits OsiAiContext while still exporting its parent entity"
    (ts/with-dbs [source-db]
      (ts/with-db source-db
        (let [db (ts/create! :model/Database :name "Prompt DB")
              t1 (ts/create! :model/Table :name "ORDERS" :db_id (:id db) :schema "PUBLIC")]
          (ts/create! :model/OsiAiContext
                      :ai_context {:instructions "orders guidance"}
                      :entity_type "table" :entity_local_id (:id t1))
          (let [models (set (map (fn [e] (:model (last (:serdes/meta e))))
                                 (into [] (extract/extract {:include-h2? true}))))]
            (is (contains? models "Table") "the parent entity is exported")
            (is (not (contains? models "OsiAiContext")) "but its ai_context is not")))))))
