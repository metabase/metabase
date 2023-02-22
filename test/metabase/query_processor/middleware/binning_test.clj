(ns metabase.query-processor.middleware.binning-test
  "There are more 'e2e' tests related to binning in [[metabase.query-processor-test.breakout-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.models.card :refer [Card]]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.binning :as binning]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest ^:parallel filter->field-map-test
  (is (= {}
         (#'binning/filter->field-map [:and
                                       [:= [:field 1 nil] 10]
                                       [:= [:field 2 nil] 10]])))

  (is (= {1 [[:< [:field 1 nil] 10] [:> [:field 1 nil] 1]]
          2 [[:> [:field 2 nil] 20] [:< [:field 2 nil] 10]]
          3 [[:between [:field 3 nil] 5 10]]}
         (#'binning/filter->field-map [:and
                                       [:< [:field 1 nil] 10]
                                       [:> [:field 1 nil] 1]
                                       [:> [:field 2 nil] 20]
                                       [:< [:field 2 nil] 10]
                                       [:between [:field 3 nil] 5 10]]))))

(deftest ^:parallel floor-to-test
  (are [x expected] (= expected
                       (#'binning/floor-to 1.0 x))
    1   1.0
    1.1 1.0
    1.8 1.0))

(deftest ^:parallel ceil-to-test
  (are [precision x expected] (= expected
                                 (#'binning/ceil-to precision x))
    1.0  1    1.0
    1.0  1.1  2.0
    1.0  1.8  2.0
    15.0 1.0  15.0
    15.0 15.0 15.0
    15.0 16.0 30.0))

(deftest ^:parallel nicer-bin-width-test
  (are [min max num-bins expected] (= expected
                                      (#'binning/nicer-bin-width min max num-bins))
    27      135      8 20
    -0.0002 10000.34 8 2000))

(def ^:private test-min-max-fingerprint
  {:type {:type/Number {:min 100 :max 1000}}})

(deftest ^:parallel extract-bounds-test
  (are [field-id->filters expected] (= expected
                                       (#'binning/extract-bounds 1 test-min-max-fingerprint field-id->filters))
    {1 [[:> [:field 1 nil] 1] [:< [:field 1 nil] 10]]}
    {:min-value 1, :max-value 10}

    {1 [[:between [:field 1 nil] 1 10]]}
    {:min-value 1, :max-value 10}

    {}
    {:min-value 100, :max-value 1000}

    {1 [[:> [:field 1 nil] 500]]}
    {:min-value 500, :max-value 1000}

    {1 [[:< [:field 1 nil] 500]]}
    {:min-value 100, :max-value 500}

    {1 [[:> [:field 1 nil] 200] [:< [:field 1 nil] 800] [:between [:field 1 nil] 600 700]]}
    {:min-value 600, :max-value 700}))

(deftest ^:parallel nicer-breakout-test
  (are [strategy opts expected] (= expected
                                   (#'binning/nicer-breakout strategy opts))
    :num-bins  {:min-value 100, :max-value 1000, :num-bins 8, :bin-width 0}  {:min-value 0.0, :max-value 1000.0, :num-bins 8, :bin-width 125.0}
    :num-bins  {:min-value 200, :max-value 1600, :num-bins 8, :bin-width 0}  {:min-value 200N, :max-value 1600N, :num-bins 8, :bin-width 200}
    :num-bins  {:min-value 9, :max-value 1002, :num-bins 8, :bin-width 0}    {:min-value 0.0, :max-value 1200.0, :num-bins 8, :bin-width 200}
    :bin-width {:min-value 9, :max-value 1002, :num-bins 1, :bin-width 15.0} {:min-value 0.0, :max-value 1005.0, :num-bins 67, :bin-width 15.0}

    :num-bins
    {:min-value 12.061602936923117, :max-value 238.32732001721533, :bin-width 28.28321, :num-bins 8}
    {:min-value 0.0, :max-value 240.0, :num-bins 8, :bin-width 30}))

(deftest ^:parallel resolve-default-strategy-test
  (is (= [:num-bins {:num-bins 8, :bin-width 28.28321}]
         (#'binning/resolve-default-strategy {:semantic_type :type/Income} 12.061602936923117 238.32732001721533))))

;; Try an end-to-end test of the middleware
(defn- test-field []
  (mi/instance
   Field
   {:database_type  "DOUBLE"
    :table_id       (mt/id :checkins)
    :semantic_type  :type/Income
    :name           "TOTAL"
    :display_name   "Total"
    :fingerprint    {:global {:distinct-count 10000}
                     :type   {:type/Number {:min 12.061602936923117
                                            :max 238.32732001721533
                                            :avg 82.96014815230829}}}
    :base_type      :type/Float
    :effective_type :type/Float}))

(deftest update-binning-strategy-test
  (mt/with-temp Field [field (test-field)]
    (is (= {:query    {:source-table (mt/id :checkins)
                       :breakout     [[:field (u/the-id field)
                                       {:binning
                                        {:strategy  :num-bins
                                         :num-bins  8
                                         :min-value 0.0
                                         :max-value 240.0
                                         :bin-width 30}}]]}
            :type     :query
            :database (mt/id)}
           (mt/with-everything-store
             (binning/update-binning-strategy
              {:query    {:source-table (mt/id :checkins)
                          :breakout     [[:field (u/the-id field) {:binning {:strategy :default}}]]}
               :type     :query
               :database (mt/id)}))))

    (testing "should work recursively on nested queries"
      (is (= {:query    {:source-query
                         {:source-table (mt/id :checkins)
                          :breakout     [[:field (u/the-id field) {:binning {:strategy  :num-bins
                                                                             :num-bins  8
                                                                             :min-value 0.0
                                                                             :max-value 240.0
                                                                             :bin-width 30}}]]}}
              :type     :query
              :database (mt/id)}
             (mt/with-everything-store
               (binning/update-binning-strategy
                {:query    {:source-query
                            {:source-table (mt/id :checkins)
                             :breakout     [[:field (u/the-id field) {:binning {:strategy :default}}]]}}
                 :type     :query
                 :database (mt/id)})))))))

(deftest binning-nested-questions-test
  (mt/with-temp Card [{card-id :id} {:dataset_query {:database (mt/id)
                                                     :type     :query
                                                     :query    {:source-table (mt/id :venues)}}}]
    (is (= [[1 22]
            [2 59]
            [3 13]
            [4 6]]
         (->> (mt/run-mbql-query nil
                {:source-table (str "card__" card-id)
                 :breakout     [[:field "PRICE" {:base-type :type/Float, :binning {:strategy :default}}]]
                 :aggregation  [[:count]]})
              (mt/formatted-rows [int int]))))))

(mt/defdataset single-row
  [["t" [{:field-name    "lat"
          :base-type     :type/Decimal
          :semantic-type :type/Latitude}
         {:field-name    "lon"
          :base-type     :type/Decimal
          :semantic-type :type/Longitude}]
    [[-27.137453079223633 -52.5982666015625]]]])

(deftest auto-bin-single-row-test
  (testing "Make sure we can auto-bin a Table that only has a single row (#13914)"
    (mt/dataset single-row
      ;; sync the Database so we have valid fingerprints for our columns.
      (sync/sync-database! (mt/db))
      (let [query (mt/mbql-query t
                    {:breakout    [[:field %lat {:binning {:strategy :default}}]
                                   [:field %lon {:binning {:strategy :default}}]]
                     :aggregation [[:count]]})]
        (mt/with-native-query-testing-context query
          (is (= [[-30.00M -60.00M 1]]
                 (mt/rows (qp/process-query query)))))))))
