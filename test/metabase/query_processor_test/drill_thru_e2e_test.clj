(ns metabase.query-processor-test.drill-thru-e2e-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(deftest ^:parallel quick-filter-on-bucketed-date-test
  (testing "a quick-filter drill on a bucketed DATE should produce valid results (#18769)"
    (mt/dataset test-data
      (qp.store/with-metadata-provider (mt/id)
        (let [products           (lib.metadata/table (qp.store/metadata-provider) (mt/id :products))
              created-at         (-> (lib.metadata/field (qp.store/metadata-provider) (mt/id :products :created_at))
                                     (lib/with-temporal-bucket :day))
              query              (-> (lib/query (qp.store/metadata-provider) products)
                                     (lib/aggregate (lib/count))
                                     (lib/breakout created-at))
              drill-context      {:column     created-at
                                  :column-ref (lib.ref/ref created-at)
                                  :value      #t "2016-05-30T00:00Z[UTC]"}
              quick-filter-drill (m/find-first #(= (:type %) :drill-thru/quick-filter)
                                               (lib/available-drill-thrus query drill-context))]
          (is (some? quick-filter-drill))
          (let [query' (lib/drill-thru query -1 quick-filter-drill "<")]
            (is (=? {:stages [{:filters [[:<
                                          {}
                                          [:field {} (mt/id :products :created_at)]
                                          #t "2016-05-30T00:00Z[UTC]"]]}]}
                    query'))
            (mt/with-native-query-testing-context query'
              (is (= [["2016-04-26T00:00:00Z" 1]
                      ["2016-04-28T00:00:00Z" 1]
                      ["2016-05-02T00:00:00Z" 1]
                      ["2016-05-04T00:00:00Z" 1]
                      ["2016-05-11T00:00:00Z" 1]
                      ["2016-05-12T00:00:00Z" 1]
                      ["2016-05-24T00:00:00Z" 1]]
                     (mt/rows (qp/process-query query')))))))))))

(deftest ^:parallel distribution-drill-on-longitude-from-sql-source-card-test
  (testing "#16672"
    (mt/dataset test-data
      (let [metadata-provider  (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            card-query         (lib/native-query metadata-provider "SELECT * FROM PEOPLE ORDER BY ID DESC LIMIT 100;")
            results            (qp/process-query card-query)
            results-metadata   (get-in results [:data :results_metadata :columns])
            _                  (is (seq results-metadata))
            metadata-provider  (lib.tu/mock-metadata-provider
                                metadata-provider
                                {:cards [{:id              1
                                          :name            "Card 1"
                                          :database-id     (mt/id)
                                          :dataset-query   card-query
                                          :result-metadata results-metadata}]})
            query              (lib/query metadata-provider (lib.metadata/card metadata-provider 1))
            longitude          (lib.field/resolve-column-name-in-metadata "LATITUDE" (lib/returned-columns query))
            _                  (is (=? {:name           "LATITUDE"
                                        :effective-type :type/Float
                                        :fingerprint    {:type {:type/Number {:min number?, :max number?}}}}
                                       longitude))
            drill-context      {:column longitude, :column-ref (lib.ref/ref longitude), :value nil}
            distribution-drill (m/find-first
                                #(= (:type %) :drill-thru/distribution)
                                (lib/available-drill-thrus query drill-context))
            _                  (is (=? {:column {:name "LATITUDE"}}
                                       distribution-drill))
            query'             (lib/drill-thru query -1 distribution-drill)]
        (is (=? {:stages [{:source-card 1
                           :aggregation [[:count {}]]
                           :breakout    [[:field {:binning {:strategy :default}} "LATITUDE"]]}]}
                query'))
        (qp.store/with-metadata-provider metadata-provider
          (is (= [[20.0 2]
                  [30.0 54]
                  [40.0 42]
                  [50.0 1]
                  [60.0 1]]
                 (mt/formatted-rows [double long]
                   (qp/process-query query')))))))))
