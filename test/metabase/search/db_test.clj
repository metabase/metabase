(ns metabase.search.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.search.db :as search.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- metric-query
  "A metric-style query over `venues`: one aggregation, no breakouts."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(deftest card-result-metadata-does-not-run-the-card-schema-upgrade-test
  (testing "reading result metadata for legacy metrics costs the same number of queries for 2 metrics and for 6"
    (mt/with-model-cleanup [:model/Card]
      (let [metric  (dissoc (mt/card-with-metadata
                             {:type          :metric
                              :database_id   (mt/id)
                              :table_id      (mt/id :venues)
                              :dataset_query (metric-query)})
                            :entity_id)
            counted (fn [n]
                      (let [card-ids (set (t2/insert-returning-pks!
                                           :model/Card
                                           (repeatedly n #(merge (mt/with-temp-defaults :model/Card) metric))))]
                        ;; Put the metrics back in the un-curated state the upgrade to 24 looks for. A raw UPDATE,
                        ;; because before-insert forces `:card_schema` to current.
                        (t2/query-one {:update :report_card
                                       :set    {:card_schema 23, :dimensions nil, :dimension_mappings nil}
                                       :where  [:in :id card-ids]})
                        (t2/with-call-count [call-count]
                          (let [metadata (search.db/card-result-metadata card-ids)]
                            (is (= (zipmap card-ids (repeat ["count"]))
                                   (update-vals metadata #(mapv :name %))))
                            (call-count)))))]
        (counted 1)
        (is (= (counted 2) (counted 6))
            (str "Going through `:model/Card` here would arm the `:card_schema` upgrade to 24, which "
                 "recomputes each metric's whole dimension set from its query — several more queries "
                 "per row, for columns search throws away."))))))

(deftest ^:parallel card-result-metadata-no-cards-test
  (testing "no card ids means no query, and no `IN ()` for the app DB to choke on"
    (is (= {}
           (t2/with-call-count [call-count]
             (let [result (search.db/card-result-metadata #{})]
               (is (zero? (call-count)))
               result))))))
