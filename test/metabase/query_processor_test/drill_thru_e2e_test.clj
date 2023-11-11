(ns metabase.query-processor-test.drill-thru-e2e-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.ref :as lib.ref]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(deftest ^:parallel quick-filter-on-bucketed-date-test
  (testing "a quick-filter drill on a bucketed DATE should produce valid results (#18769)"
    (mt/dataset sample-dataset
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
          (let [query' (lib/drill-thru query -1 quick-filter-drill "=")]
            (is (=? {:stages [{:filters [[:=
                                          {}
                                          [:field {:temporal-unit :day} (mt/id :products :created_at)]
                                          #t "2016-05-30T00:00Z[UTC]"]]}]}
                    query'))
            (mt/with-native-query-testing-context query'
              (is (= [["2016-05-30T00:00:00Z" 2]]
                     (mt/rows (qp/process-query query')))))))))))
