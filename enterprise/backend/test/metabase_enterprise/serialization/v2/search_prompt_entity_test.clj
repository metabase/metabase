(ns metabase-enterprise.serialization.v2.search-prompt-entity-test
  "Round-trip serialization tests for `:model/SearchPromptEntity`, whose `entities` column holds a
  polymorphic list of Card/Table references that must survive export and import."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.warehouses.models.database :as models.database]
   [toucan2.core :as t2]))

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

(deftest search-prompt-entity-round-trip-test
  (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} {}]
    (let [table-id (mt/id :venues)
          entities [{:model "card" :id card-id}
                    {:model "table" :id table-id}]]
      (mt/with-temp [:model/SearchPromptEntity {spe-id :id spe-eid :entity_id}
                     {:prompt "best venues" :type :sources :verified true :entities entities}]
        (let [extracted (ts/extract-one "SearchPromptEntity" spe-id)
              [card-ref table-ref] (:entities extracted)]
          (testing "entity refs are exported as portable references"
            (is (=? {:entity_id spe-eid
                     :prompt    "best venues"
                     :type      "sources"
                     :verified  true
                     :entities  [{:model "card"  :id card-eid}
                                 {:model "table" :id vector?}]}
                    extracted))
            (is (= ["VENUES"] (take-last 1 (:id table-ref)))))
          (testing "dependencies cover the referenced Card and the Table's Database"
            (is (= #{[{:model "Card" :id card-eid}]
                     [{:model "Database" :id (first (:id table-ref))}]}
                   (serdes/dependencies extracted))))
          (testing "importing resolves the refs back to local ids"
            (t2/delete! :model/SearchPromptEntity :id spe-id)
            (serdes.load/load-metabase! (ingestion-in-memory [extracted]))
            (is (= entities
                   (t2/select-one-fn :entities :model/SearchPromptEntity :entity_id spe-eid)))))))))
