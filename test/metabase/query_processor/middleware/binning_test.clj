(ns metabase.query-processor.middleware.binning-test
  "There are more 'e2e' tests related to binning in [[metabase.query-processor.breakout-test]]."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.binning :as binning]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(deftest ^:parallel filter->field-map-test
  (is (= {}
         (#'binning/filters->field-map
          (lib.normalize/normalize
           ::lib.schema/filters
           [[:and
             [:= {} [:field {} 1] 10]
             [:= {} [:field {} 2] 10]]]))))

  (is (=? {1 [[:< {} [:field {} 1] 10] [:> {} [:field {} 1] 1]]
           2 [[:> {} [:field {} 2] 20] [:< {} [:field {} 2] 10]]
           3 [[:between {} [:field {} 3] 5 10]]}
          (#'binning/filters->field-map
           (lib.normalize/normalize
            ::lib.schema/filters
            [[:and
              [:< {} [:field {} 1] 10]
              [:> {} [:field {} 1] 1]
              [:> {} [:field {} 2] 20]
              [:< {} [:field {} 2] 10]
              [:between {} [:field {} 3] 5 10]]])))))

(def ^:private test-min-max-fingerprint
  {:type {:type/Number {:min 100 :max 1000}}})

(deftest ^:parallel extract-bounds-test
  (are [field-id->filters expected] (= expected
                                       (#'binning/extract-bounds
                                        1 test-min-max-fingerprint
                                        (lib.normalize/normalize
                                         [:map-of ::lib.schema.id/field ::lib.schema/filters]
                                         field-id->filters)))
    {1 [[:> {} [:field {} 1] 1]
        [:< {} [:field {} 1] 10]]}
    {:min-value 1, :max-value 10}

    {1 [[:between {} [:field {} 1] 1 10]]}
    {:min-value 1, :max-value 10}

    {}
    {:min-value 100, :max-value 1000}

    {1 [[:> {} [:field {} 1] 500]]}
    {:min-value 500, :max-value 1000}

    {1 [[:< {} [:field {} 1] 500]]}
    {:min-value 100, :max-value 500}

    {1 [[:> {} [:field {} 1] 200] [:< {} [:field {} 1] 800] [:between {} [:field {} 1] 600 700]]}
    {:min-value 600, :max-value 700}))

(deftest ^:parallel extract-bounds-field-name-test
  (testing "Should be able to adjust min max based on filters against named field refs. (#26202)"
    (is (= {:min-value 1, :max-value 10}
           (#'binning/extract-bounds
            "foo" test-min-max-fingerprint
            {"foo" (lib.normalize/normalize
                    ::lib.schema/filters
                    [[:> {} [:field {} 1] 1] [:< {} [:field {} 1] 10]])})))))

;; Try an end-to-end test of the middleware
(defn- mock-field-metadata-provider []
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:fields [(merge (meta/field-metadata :orders :total)
                    {:id             1
                     :database-type  "DOUBLE"
                     :table-id       (meta/id :checkins)
                     :semantic-type  :type/Income
                     :name           "TOTAL"
                     :display-name   "Total"
                     :fingerprint    {:global {:distinct-count 10000}
                                      :type   {:type/Number {:min 12.061602936923117
                                                             :max 238.32732001721533
                                                             :avg 82.96014815230829}}}
                     :base-type      :type/Float
                     :effective-type :type/Float})]}))

(defn- update-binning-strategy [mp query]
  (-> (lib/query mp query)
      binning/update-binning-strategy
      lib/->legacy-MBQL))

(deftest ^:parallel update-binning-strategy-test
  (is (= {:query    {:source-table (meta/id :checkins)
                     :breakout     [[:field 1
                                     {:binning
                                      {:strategy  :num-bins
                                       :num-bins  8
                                       :min-value 0.0
                                       :max-value 240.0
                                       :bin-width 30.0}}]]}
          :type     :query
          :database (meta/id)}
         (update-binning-strategy
          (mock-field-metadata-provider)
          {:query    {:source-table (meta/id :checkins)
                      :breakout     [[:field 1 {:binning {:strategy :default}}]]}
           :type     :query
           :database (meta/id)}))))

(deftest ^:parallel update-binning-strategy-test-2
  (testing "should work recursively on nested queries"
    (is (= {:query    {:source-query
                       {:source-table (meta/id :checkins)
                        :breakout     [[:field 1 {:binning {:strategy  :num-bins
                                                            :num-bins  8
                                                            :min-value 0.0
                                                            :max-value 240.0
                                                            :bin-width 30.0}}]]}}
            :type     :query
            :database (meta/id)}
           (update-binning-strategy
            (mock-field-metadata-provider)
            {:query    {:source-query
                        {:source-table (meta/id :checkins)
                         :breakout     [[:field 1 {:binning {:strategy :default}}]]}}
             :type     :query
             :database (meta/id)})))))

(deftest ^:parallel binning-nested-questions-test
  (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                    (mt/metadata-provider)
                                    [(mt/mbql-query venues)])
    (is (= [[1 22]
            [2 59]
            [3 13]
            [4 6]]
           (->> {:source-table "card__1"
                 :breakout     [[:field "PRICE" {:base-type :type/Float, :binning {:strategy :default}}]]
                 :aggregation  [[:count]]}
                (mt/run-mbql-query nil)
                (mt/formatted-rows [int int]))))))

;;; TODO (Cam 7/28/25) -- can we use a mock metadata provider here instead of defining an entire new dataset (and
;;; loading new data?)
(mt/defdataset single-row
  [["t" [{:field-name    "lat"
          :base-type     :type/Decimal
          :semantic-type :type/Latitude}
         {:field-name    "lon"
          :base-type     :type/Decimal
          :semantic-type :type/Longitude}]
    [[-27.137453079223633 -52.5982666015625]]]])

(def ^:private single-row-fingerprints
  {:lat {:global {:distinct-count 10, :nil% 0.0}
         :type   {:type/Number {:min -27.0
                                :max -27.0}}}
   :lon {:global {:distinct-count 10, :nil% 0.0}
         :type   {:type/Number {:min -53.0
                                :max -53.0}}}})

(deftest ^:parallel auto-bin-single-row-test
  (testing "Make sure we can auto-bin a Table that only has a single row (#13914)"
    (mt/dataset single-row
      (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                        (mt/metadata-provider)
                                        {:fields [{:id          (mt/id :t :lat)
                                                   :fingerprint (single-row-fingerprints :lat)}
                                                  {:id          (mt/id :t :lon)
                                                   :fingerprint (single-row-fingerprints :lon)}]})
        (let [query (mt/mbql-query t
                      {:breakout    [[:field %lat {:binning {:strategy :default}}]
                                     [:field %lon {:binning {:strategy :default}}]]
                       :aggregation [[:count]]})]
          (is (=? {:query {:breakout [[:field integer? {:binning {:strategy  :bin-width
                                                                  :min-value -30.0
                                                                  :max-value -20.0
                                                                  :num-bins  1
                                                                  :bin-width 10.0}}]
                                      [:field integer? {:binning {:strategy  :bin-width
                                                                  :min-value -60.0
                                                                  :max-value -50.0
                                                                  :num-bins  1
                                                                  :bin-width 10.0}}]]}}
                  (update-binning-strategy (qp.store/metadata-provider) query)))
          (mt/with-native-query-testing-context query
            (is (= [[-30.00M -60.00M 1]]
                   (mt/rows (qp/process-query query))))))))))

(deftest ^:parallel match-named-field-ref-filter
  (testing "fields referencing source expressions can still properly update binning strategies (#26202)"
    (let [card-query       (lib.tu.macros/mbql-query orders
                             {:fields      [$total [:expression "foo"]]
                              :expressions {"foo" [:+ $total 0]}})
          card-cols        (-> (qp.preprocess/query->expected-cols (lib/query meta/metadata-provider card-query))
                               (update 1 assoc
                                       :semantic_type :type/Quantity
                                       ;; apparently the fingerprint in the [[meta/field-metadata]] is stale or
                                       ;; something. See
                                       ;; https://metaboat.slack.com/archives/C0645JP1W81/p1753993801175699
                                       :fingerprint   {:global {:distinct-count 4957, :nil% 0.0}
                                                       :type   {:type/Number {:min -45.48
                                                                              :q1  51.15112909560095
                                                                              :q3  110.89552922878748
                                                                              :max 159.35
                                                                              :sd  34.46092341352156
                                                                              :avg 80.52333155650321}}}))
          mp               (lib.tu/mock-metadata-provider
                            meta/metadata-provider
                            {:cards [{:id              1
                                      :dataset-query   card-query
                                      :result-metadata card-cols}]})
          query            (lib/query mp (lib.metadata/card mp 1))
          expr-col         (m/find-first #(= (:name %) "foo") (lib/breakoutable-columns query))
          _                (is (some? expr-col))
          binning-strategy (m/find-first #(= (:display-name %) "10 bins")
                                         (lib/available-binning-strategies query expr-col))
          _                (is (some? binning-strategy))
          query            (-> query
                               (lib/breakout (lib/with-binning expr-col binning-strategy)))]
      (testing "without filter"
        (is (=? {:query {:breakout [[:field
                                     "foo"
                                     {:base-type :type/Float
                                      :binning   {:strategy :num-bins, :num-bins 10, :min-value -50.0, :max-value 175.0, :bin-width 25.0}}]]}}
                (update-binning-strategy mp (-> query
                                                lib.convert/->legacy-MBQL
                                                (assoc-in [:query :source-metadata] card-cols))))))
      (testing "with filter"
        (is (=? {:query {:breakout [[:field
                                     "foo"
                                     {:base-type :type/Float
                                      :binning   {:strategy :num-bins, :num-bins 10, :min-value 20.0, :max-value 40.0, :bin-width 2.0}}]]}}
                (update-binning-strategy mp (-> (lib/filter query (lib/between expr-col 20 40))
                                                lib.convert/->legacy-MBQL
                                                (assoc-in [:query :source-metadata] card-cols)))))))))

(deftest ^:parallel update-original-binning-e2e-test
  (testing "#63662"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/count))
                    (lib/breakout (-> (meta/field-metadata :orders :total)
                                      (lib/with-binning {:strategy :default})))
                    lib/append-stage
                    qp.preprocess/preprocess)]
      (is (=? {:stages [{:aggregation [[:count {}]]
                         :breakout    [[:field {:binning {:bin-width 20.0, :max-value 160.0, :min-value 0.0, :num-bins 8, :strategy :num-bins}}
                                        any?]]
                         :order-by    [[:asc
                                        {}
                                        [:field {:binning {:bin-width 20.0, :max-value 160.0, :min-value 0.0, :num-bins 8, :strategy :num-bins}}
                                         any?]]]}
                        {:fields [[:field {:lib/original-binning {:bin-width 20.0, :max-value 160.0, :min-value 0.0, :num-bins 8, :strategy :num-bins}} "TOTAL"]
                                  [:field {} "count"]]}]}
              query))
      (testing `lib/returned-columns
        (letfn [(returned-columns [stage-number]
                  (map #(select-keys % [:lib/desired-column-alias :metabase.lib.field/binning :lib/original-binning])
                       (lib/returned-columns query stage-number)))]
          (testing "first stage"
            (is (= [{:lib/desired-column-alias   "TOTAL"
                     :metabase.lib.field/binning {:strategy :num-bins, :min-value 0.0, :max-value 160.0, :num-bins 8, :bin-width 20.0}
                     :lib/original-binning       {:strategy :num-bins, :min-value 0.0, :max-value 160.0, :num-bins 8, :bin-width 20.0}}
                    {:lib/desired-column-alias "count"}]
                   (returned-columns 0))))
          (testing "second stage"
            (is (= [{:lib/desired-column-alias "TOTAL"
                     :lib/original-binning     {:strategy :num-bins, :min-value 0.0, :max-value 160.0, :num-bins 8, :bin-width 20.0}}
                    {:lib/desired-column-alias "count"}]
                   (returned-columns 1))))))
      (testing `lib.metadata.result-metadata/returned-columns
        (is (=? [{:lib/desired-column-alias "TOTAL"
                  :binning-info             {:strategy :num-bins, :min-value 0.0, :max-value 160.0, :num-bins 8, :bin-width 20.0}}
                 {:lib/desired-column-alias "count"}]
                (map #(select-keys % [:lib/desired-column-alias :binning-info])
                     (lib.metadata.result-metadata/returned-columns query))))))))
