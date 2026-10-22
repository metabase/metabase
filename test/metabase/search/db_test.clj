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
  (testing "reading result metadata for a legacy metric costs one query"
    (mt/with-temp [:model/Card {card-id :id} {:type          :metric
                                              :database_id   (mt/id)
                                              :table_id      (mt/id :venues)
                                              :dataset_query (metric-query)}]
      ;; Put the metric back in the un-curated state the upgrade to 24 looks for. A raw UPDATE, because
      ;; before-insert forces `:card_schema` to current and `with-temp` would silently ignore it.
      (t2/query-one {:update :report_card
                     :set    {:card_schema 23, :dimensions nil, :dimension_mappings nil}
                     :where  [:= :id card-id]})
      (is (= ["count"]
             (t2/with-call-count [call-count]
               (let [metadata (get (search.db/card-result-metadata #{card-id}) card-id)]
                 (is (= 1 (call-count))
                     (str "Going through `:model/Card` here would arm the `:card_schema` upgrade to 24, which "
                          "recomputes this metric's whole dimension set from its query — several more queries "
                          "per row, for columns search throws away."))
                 (mapv :name metadata))))))))

(deftest ^:parallel card-result-metadata-no-cards-test
  (testing "no card ids means no query, and no `IN ()` for the app DB to choke on"
    (is (= {}
           (t2/with-call-count [call-count]
             (let [result (search.db/card-result-metadata #{})]
               (is (zero? (call-count)))
               result))))))
