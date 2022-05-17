(ns metabase.query-processor.middleware.binning-test
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.models.field :as field :refer [Field]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.binning :as binning]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest filter->field-map-test
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

(deftest floor-to-test
  (mt/are+ [x expected] (= expected
                           (#'binning/floor-to 1.0 x))
    1   1.0
    1.1 1.0
    1.8 1.0))

(deftest ceil-to-test
  (mt/are+ [precision x expected] (= expected
                                     (#'binning/ceil-to precision x))
    1.0  1    1.0
    1.0  1.1  2.0
    1.0  1.8  2.0
    15.0 1.0  15.0
    15.0 15.0 15.0
    15.0 16.0 30.0))

(deftest nicer-bin-width-test
  (mt/are+ [min max num-bins expected] (= expected
                                          (#'binning/nicer-bin-width min max num-bins))
    27      135      8 20
    -0.0002 10000.34 8 2000))

(def ^:private test-min-max-fingerprint
  {:type {:type/Number {:min 100 :max 1000}}})

(deftest extract-bounds-test
  (mt/are+ [field-id->filters expected] (= expected
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

(deftest nicer-breakout-test
  (mt/are+ [strategy opts expected] (= expected
                                   (#'binning/nicer-breakout strategy opts))
    :num-bins  {:min-value 100, :max-value 1000, :num-bins 8, :bin-width 0}  {:min-value 0.0, :max-value 1000.0, :num-bins 8, :bin-width 125.0}
    :num-bins  {:min-value 200, :max-value 1600, :num-bins 8, :bin-width 0}  {:min-value 200N, :max-value 1600N, :num-bins 8, :bin-width 200}
    :num-bins  {:min-value 9, :max-value 1002, :num-bins 8, :bin-width 0}    {:min-value 0.0, :max-value 1200.0, :num-bins 8, :bin-width 200}
    :bin-width {:min-value 9, :max-value 1002, :num-bins 1, :bin-width 15.0} {:min-value 0.0, :max-value 1005.0, :num-bins 67, :bin-width 15.0}

    :num-bins
    {:min-value 12.061602936923117, :max-value 238.32732001721533, :bin-width 28.28321, :num-bins 8}
    {:min-value 0.0, :max-value 240.0, :num-bins 8, :bin-width 30}))

(deftest resolve-default-strategy-test
  (is (= [:num-bins {:num-bins 8, :bin-width 28.28321}]
         (#'binning/resolve-default-strategy {:semantic_type :type/Income} 12.061602936923117 238.32732001721533))))

;; Try an end-to-end test of the middleware
(defn- test-field []
  (field/map->FieldInstance
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


(def fill-empty-bins-examples
  [{:input
    {:query
     {:source-table 2,
      :aggregation [[:count]],
      :breakout
      [[:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]],
      :limit 10,
      :order-by
      [[:asc [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]]}}

    :expected {:breakout
               [[:field
                 1
                 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5},
                  :join-alias "bin",
                  :canonical-field
                  [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]}]],
               :joins
               [{:strategy :right-join,
                 :source-query
                 {:native "(VALUES (0.0), (7.5), (15.0), (22.5), (30.0), (37.5), (45.0), (52.5), (60.0)) as bin(\"_FieldName_1\")"},
                 :alias "bin",
                 :condition
                 [:=
                  [:field
                   1
                   {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5},
                    :join-alias "bin",
                    :canonical-field
                    [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]}]
                  [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]}]}}

   {:input
    {:query
     {:source-table 2,
      :aggregation [[:count]],
      :breakout
      [[:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]],
      :limit 10,
      :order-by
      [[:asc [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]]}}

    :expected {:breakout
               [[:field
                 1
                 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5},
                  :join-alias "bin",
                  :canonical-field
                  [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]}]],
               :joins
               [{:strategy :right-join,
                 :source-query
                 {:native "(VALUES (0.0), (7.5), (15.0), (22.5), (30.0), (37.5), (45.0), (52.5), (60.0)) as bin(\"_FieldName_1\")"},
                 :alias "bin",
                 :condition
                 [:=
                  [:field
                   1
                   {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5},
                    :join-alias "bin",
                    :canonical-field
                    [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]}]
                  [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]}]}}


   {:input
    {:query
     {:source-table 2,
      :aggregation [[:count]],
      :breakout
      [[:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]
       [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]],
      :limit 10,
      :order-by
      [[:asc [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]
       [:asc [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]]]}}

    :expected {:breakout
               [[:field
                 1
                 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5},
                  :join-alias "bin",
                  :canonical-field
                  [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]}]
                [:field
                 8
                 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2},
                  :join-alias "bin",
                  :canonical-field
                  [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]}]],
               :joins
               [{:strategy :right-join,
                 :source-query
                 {:native
                  "(VALUES (0.0, 0.0), (0.0, 2.0), (0.0, 4.0), (0.0, 6.0), (0.0, 8.0), (0.0, 10.0), (7.5, 0.0), (7.5, 2.0), (7.5, 4.0), (7.5, 6.0), (7.5, 8.0), (7.5, 10.0), (15.0, 0.0), (15.0, 2.0), (15.0, 4.0), (15.0, 6.0), (15.0, 8.0), (15.0, 10.0), (22.5, 0.0), (22.5, 2.0), (22.5, 4.0), (22.5, 6.0), (22.5, 8.0), (22.5, 10.0), (30.0, 0.0), (30.0, 2.0), (30.0, 4.0), (30.0, 6.0), (30.0, 8.0), (30.0, 10.0), (37.5, 0.0), (37.5, 2.0), (37.5, 4.0), (37.5, 6.0), (37.5, 8.0), (37.5, 10.0), (45.0, 0.0), (45.0, 2.0), (45.0, 4.0), (45.0, 6.0), (45.0, 8.0), (45.0, 10.0), (52.5, 0.0), (52.5, 2.0), (52.5, 4.0), (52.5, 6.0), (52.5, 8.0), (52.5, 10.0), (60.0, 0.0), (60.0, 2.0), (60.0, 4.0), (60.0, 6.0), (60.0, 8.0), (60.0, 10.0)) as bin(\"_FieldName_1\", \"_FieldName_8\")"},
                 :alias "bin",
                 :condition
                 [:and
                  [:=
                   [:field
                    1
                    {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5},
                     :join-alias "bin",
                     :canonical-field
                     [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]}]
                   [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]
                  [:=
                   [:field
                    8
                    {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2},
                     :join-alias "bin",
                     :canonical-field
                     [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]}]
                   [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]]]}]}}


   {:input
    {:query
     {:source-table 2,
      :aggregation [[:count]],
      :breakout
      [[:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]
       [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]],
      :limit 10,
      :order-by
      [[:asc [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]
       [:asc [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]]]}}

    :expected {:breakout
               [[:field
                 1
                 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5},
                  :join-alias "bin",
                  :canonical-field
                  [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]}]
                [:field
                 8
                 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2},
                  :join-alias "bin",
                  :canonical-field
                  [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]}]],
               :joins
               [{:strategy :right-join,
                 :source-query
                 {:native
                  "(VALUES (0.0, 0.0), (0.0, 2.0), (0.0, 4.0), (0.0, 6.0), (0.0, 8.0), (0.0, 10.0), (7.5, 0.0), (7.5, 2.0), (7.5, 4.0), (7.5, 6.0), (7.5, 8.0), (7.5, 10.0), (15.0, 0.0), (15.0, 2.0), (15.0, 4.0), (15.0, 6.0), (15.0, 8.0), (15.0, 10.0), (22.5, 0.0), (22.5, 2.0), (22.5, 4.0), (22.5, 6.0), (22.5, 8.0), (22.5, 10.0), (30.0, 0.0), (30.0, 2.0), (30.0, 4.0), (30.0, 6.0), (30.0, 8.0), (30.0, 10.0), (37.5, 0.0), (37.5, 2.0), (37.5, 4.0), (37.5, 6.0), (37.5, 8.0), (37.5, 10.0), (45.0, 0.0), (45.0, 2.0), (45.0, 4.0), (45.0, 6.0), (45.0, 8.0), (45.0, 10.0), (52.5, 0.0), (52.5, 2.0), (52.5, 4.0), (52.5, 6.0), (52.5, 8.0), (52.5, 10.0), (60.0, 0.0), (60.0, 2.0), (60.0, 4.0), (60.0, 6.0), (60.0, 8.0), (60.0, 10.0)) as bin(\"_FieldName_1\", \"_FieldName_8\")"},
                 :alias "bin",
                 :condition
                 [:and
                  [:=
                   [:field
                    1
                    {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5},
                     :join-alias "bin",
                     :canonical-field
                     [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]}]
                   [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]
                  [:=
                   [:field
                    8
                    {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2},
                     :join-alias "bin",
                     :canonical-field
                     [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]}]
                   [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]]]}]}}

   {:input
    {:query
     {:source-table 2,
      :aggregation [[:count]],
      :breakout
      [[:field 1 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20}}]
       [:field 8 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200}}]
       [:field 2 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000}}]],
      :limit 10,
      :order-by
      [[:asc [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]
       [:asc [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]]
       [:asc [:field 2 {:binning {:strategy :num-bins, :num-bins 50, :min-value 0.0, :max-value 100.0, :bin-width 2}}]]]}}

    :expected {:breakout
               [[:field
                 1
                 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20},
                  :join-alias "bin",
                  :canonical-field
                  [:field 1 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20}}]}]
                [:field
                 8
                 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200},
                  :join-alias "bin",
                  :canonical-field
                  [:field 8 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200}}]}]
                [:field
                 2
                 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000},
                  :join-alias "bin",
                  :canonical-field
                  [:field 2 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000}}]}]],
               :joins
               [{:strategy :right-join,
                 :source-query
                 {:native
                  "(VALUES (0.0, 0.0, 0.0), (0.0, 0.0, 2000.0), (0.0, 0.0, 4000.0), (0.0, 0.0, 6000.0), (0.0, 0.0, 8000.0), (0.0, 200.0, 0.0), (0.0, 200.0, 2000.0), (0.0, 200.0, 4000.0), (0.0, 200.0, 6000.0), (0.0, 200.0, 8000.0), (0.0, 400.0, 0.0), (0.0, 400.0, 2000.0), (0.0, 400.0, 4000.0), (0.0, 400.0, 6000.0), (0.0, 400.0, 8000.0), (0.0, 600.0, 0.0), (0.0, 600.0, 2000.0), (0.0, 600.0, 4000.0), (0.0, 600.0, 6000.0), (0.0, 600.0, 8000.0), (0.0, 800.0, 0.0), (0.0, 800.0, 2000.0), (0.0, 800.0, 4000.0), (0.0, 800.0, 6000.0), (0.0, 800.0, 8000.0), (20.0, 0.0, 0.0), (20.0, 0.0, 2000.0), (20.0, 0.0, 4000.0), (20.0, 0.0, 6000.0), (20.0, 0.0, 8000.0), (20.0, 200.0, 0.0), (20.0, 200.0, 2000.0), (20.0, 200.0, 4000.0), (20.0, 200.0, 6000.0), (20.0, 200.0, 8000.0), (20.0, 400.0, 0.0), (20.0, 400.0, 2000.0), (20.0, 400.0, 4000.0), (20.0, 400.0, 6000.0), (20.0, 400.0, 8000.0), (20.0, 600.0, 0.0), (20.0, 600.0, 2000.0), (20.0, 600.0, 4000.0), (20.0, 600.0, 6000.0), (20.0, 600.0, 8000.0), (20.0, 800.0, 0.0), (20.0, 800.0, 2000.0), (20.0, 800.0, 4000.0), (20.0, 800.0, 6000.0), (20.0, 800.0, 8000.0), (40.0, 0.0, 0.0), (40.0, 0.0, 2000.0), (40.0, 0.0, 4000.0), (40.0, 0.0, 6000.0), (40.0, 0.0, 8000.0), (40.0, 200.0, 0.0), (40.0, 200.0, 2000.0), (40.0, 200.0, 4000.0), (40.0, 200.0, 6000.0), (40.0, 200.0, 8000.0), (40.0, 400.0, 0.0), (40.0, 400.0, 2000.0), (40.0, 400.0, 4000.0), (40.0, 400.0, 6000.0), (40.0, 400.0, 8000.0), (40.0, 600.0, 0.0), (40.0, 600.0, 2000.0), (40.0, 600.0, 4000.0), (40.0, 600.0, 6000.0), (40.0, 600.0, 8000.0), (40.0, 800.0, 0.0), (40.0, 800.0, 2000.0), (40.0, 800.0, 4000.0), (40.0, 800.0, 6000.0), (40.0, 800.0, 8000.0), (60.0, 0.0, 0.0), (60.0, 0.0, 2000.0), (60.0, 0.0, 4000.0), (60.0, 0.0, 6000.0), (60.0, 0.0, 8000.0), (60.0, 200.0, 0.0), (60.0, 200.0, 2000.0), (60.0, 200.0, 4000.0), (60.0, 200.0, 6000.0), (60.0, 200.0, 8000.0), (60.0, 400.0, 0.0), (60.0, 400.0, 2000.0), (60.0, 400.0, 4000.0), (60.0, 400.0, 6000.0), (60.0, 400.0, 8000.0), (60.0, 600.0, 0.0), (60.0, 600.0, 2000.0), (60.0, 600.0, 4000.0), (60.0, 600.0, 6000.0), (60.0, 600.0, 8000.0), (60.0, 800.0, 0.0), (60.0, 800.0, 2000.0), (60.0, 800.0, 4000.0), (60.0, 800.0, 6000.0), (60.0, 800.0, 8000.0), (80.0, 0.0, 0.0), (80.0, 0.0, 2000.0), (80.0, 0.0, 4000.0), (80.0, 0.0, 6000.0), (80.0, 0.0, 8000.0), (80.0, 200.0, 0.0), (80.0, 200.0, 2000.0), (80.0, 200.0, 4000.0), (80.0, 200.0, 6000.0), (80.0, 200.0, 8000.0), (80.0, 400.0, 0.0), (80.0, 400.0, 2000.0), (80.0, 400.0, 4000.0), (80.0, 400.0, 6000.0), (80.0, 400.0, 8000.0), (80.0, 600.0, 0.0), (80.0, 600.0, 2000.0), (80.0, 600.0, 4000.0), (80.0, 600.0, 6000.0), (80.0, 600.0, 8000.0), (80.0, 800.0, 0.0), (80.0, 800.0, 2000.0), (80.0, 800.0, 4000.0), (80.0, 800.0, 6000.0), (80.0, 800.0, 8000.0)) as bin(\"_FieldName_1\", \"_FieldName_8\", \"_FieldName_2\")"},
                 :alias "bin",
                 :condition
                 [:and
                  [:=
                   [:field
                    1
                    {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20},
                     :join-alias "bin",
                     :canonical-field
                     [:field 1 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20}}]}]
                   [:field 1 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20}}]]
                  [:=
                   [:field
                    8
                    {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200},
                     :join-alias "bin",
                     :canonical-field
                     [:field 8 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200}}]}]
                   [:field 8 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200}}]]
                  [:=
                   [:field
                    2
                    {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000},
                     :join-alias "bin",
                     :canonical-field
                     [:field 2 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000}}]}]
                   [:field 2 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000}}]]]}]}}
   {:input {:query
            {:source-table 2,
             :aggregation [[:count]],
             :breakout
             [[:field 1 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20}}]
              [:field 8 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200}}]
              [:field 2 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000}}]],
             :limit 10,
             :order-by
             [[:asc [:field 1 {:binning {:strategy :num-bins, :num-bins 10, :min-value 0.0, :max-value 67.5, :bin-width 7.5}}]]
              [:asc [:field 8 {:binning {:strategy :num-bins, :min-value 0.0, :max-value 12.0, :num-bins 8, :bin-width 2}}]]
              [:asc [:field 2 {:binning {:strategy :num-bins, :num-bins 50, :min-value 0.0, :max-value 100.0, :bin-width 2}}]]]}}
    :expected {:breakout
               [[:field
                 1
                 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20},
                  :join-alias "bin",
                  :canonical-field
                  [:field 1 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20}}]}]
                [:field
                 8
                 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200},
                  :join-alias "bin",
                  :canonical-field
                  [:field 8 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200}}]}]
                [:field
                 2
                 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000},
                  :join-alias "bin",
                  :canonical-field
                  [:field 2 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000}}]}]],
               :joins
               [{:strategy :right-join,
                 :source-query
                 {:native
                  "(VALUES (0.0, 0.0, 0.0), (0.0, 0.0, 2000.0), (0.0, 0.0, 4000.0), (0.0, 0.0, 6000.0), (0.0, 0.0, 8000.0), (0.0, 200.0, 0.0), (0.0, 200.0, 2000.0), (0.0, 200.0, 4000.0), (0.0, 200.0, 6000.0), (0.0, 200.0, 8000.0), (0.0, 400.0, 0.0), (0.0, 400.0, 2000.0), (0.0, 400.0, 4000.0), (0.0, 400.0, 6000.0), (0.0, 400.0, 8000.0), (0.0, 600.0, 0.0), (0.0, 600.0, 2000.0), (0.0, 600.0, 4000.0), (0.0, 600.0, 6000.0), (0.0, 600.0, 8000.0), (0.0, 800.0, 0.0), (0.0, 800.0, 2000.0), (0.0, 800.0, 4000.0), (0.0, 800.0, 6000.0), (0.0, 800.0, 8000.0), (20.0, 0.0, 0.0), (20.0, 0.0, 2000.0), (20.0, 0.0, 4000.0), (20.0, 0.0, 6000.0), (20.0, 0.0, 8000.0), (20.0, 200.0, 0.0), (20.0, 200.0, 2000.0), (20.0, 200.0, 4000.0), (20.0, 200.0, 6000.0), (20.0, 200.0, 8000.0), (20.0, 400.0, 0.0), (20.0, 400.0, 2000.0), (20.0, 400.0, 4000.0), (20.0, 400.0, 6000.0), (20.0, 400.0, 8000.0), (20.0, 600.0, 0.0), (20.0, 600.0, 2000.0), (20.0, 600.0, 4000.0), (20.0, 600.0, 6000.0), (20.0, 600.0, 8000.0), (20.0, 800.0, 0.0), (20.0, 800.0, 2000.0), (20.0, 800.0, 4000.0), (20.0, 800.0, 6000.0), (20.0, 800.0, 8000.0), (40.0, 0.0, 0.0), (40.0, 0.0, 2000.0), (40.0, 0.0, 4000.0), (40.0, 0.0, 6000.0), (40.0, 0.0, 8000.0), (40.0, 200.0, 0.0), (40.0, 200.0, 2000.0), (40.0, 200.0, 4000.0), (40.0, 200.0, 6000.0), (40.0, 200.0, 8000.0), (40.0, 400.0, 0.0), (40.0, 400.0, 2000.0), (40.0, 400.0, 4000.0), (40.0, 400.0, 6000.0), (40.0, 400.0, 8000.0), (40.0, 600.0, 0.0), (40.0, 600.0, 2000.0), (40.0, 600.0, 4000.0), (40.0, 600.0, 6000.0), (40.0, 600.0, 8000.0), (40.0, 800.0, 0.0), (40.0, 800.0, 2000.0), (40.0, 800.0, 4000.0), (40.0, 800.0, 6000.0), (40.0, 800.0, 8000.0), (60.0, 0.0, 0.0), (60.0, 0.0, 2000.0), (60.0, 0.0, 4000.0), (60.0, 0.0, 6000.0), (60.0, 0.0, 8000.0), (60.0, 200.0, 0.0), (60.0, 200.0, 2000.0), (60.0, 200.0, 4000.0), (60.0, 200.0, 6000.0), (60.0, 200.0, 8000.0), (60.0, 400.0, 0.0), (60.0, 400.0, 2000.0), (60.0, 400.0, 4000.0), (60.0, 400.0, 6000.0), (60.0, 400.0, 8000.0), (60.0, 600.0, 0.0), (60.0, 600.0, 2000.0), (60.0, 600.0, 4000.0), (60.0, 600.0, 6000.0), (60.0, 600.0, 8000.0), (60.0, 800.0, 0.0), (60.0, 800.0, 2000.0), (60.0, 800.0, 4000.0), (60.0, 800.0, 6000.0), (60.0, 800.0, 8000.0), (80.0, 0.0, 0.0), (80.0, 0.0, 2000.0), (80.0, 0.0, 4000.0), (80.0, 0.0, 6000.0), (80.0, 0.0, 8000.0), (80.0, 200.0, 0.0), (80.0, 200.0, 2000.0), (80.0, 200.0, 4000.0), (80.0, 200.0, 6000.0), (80.0, 200.0, 8000.0), (80.0, 400.0, 0.0), (80.0, 400.0, 2000.0), (80.0, 400.0, 4000.0), (80.0, 400.0, 6000.0), (80.0, 400.0, 8000.0), (80.0, 600.0, 0.0), (80.0, 600.0, 2000.0), (80.0, 600.0, 4000.0), (80.0, 600.0, 6000.0), (80.0, 600.0, 8000.0), (80.0, 800.0, 0.0), (80.0, 800.0, 2000.0), (80.0, 800.0, 4000.0), (80.0, 800.0, 6000.0), (80.0, 800.0, 8000.0)) as bin(\"_FieldName_1\", \"_FieldName_8\", \"_FieldName_2\")"},
                 :alias "bin",
                 :condition
                 [:and
                  [:=
                   [:field
                    1
                    {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20},
                     :join-alias "bin",
                     :canonical-field
                     [:field 1 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20}}]}]
                   [:field 1 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 100, :bin-width 20}}]]
                  [:=
                   [:field
                    8
                    {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200},
                     :join-alias "bin",
                     :canonical-field
                     [:field 8 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200}}]}]
                   [:field 8 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 1000, :bin-width 200}}]]
                  [:=
                   [:field
                    2
                    {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000},
                     :join-alias "bin",
                     :canonical-field
                     [:field 2 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000}}]}]
                   [:field 2 {:binning {:strategy :num-bins, :num-bins 5, :min-value 0.0, :max-value 10000, :bin-width 2000}}]]]}]}}])


(deftest rewrite-query-to-fill-empty-bins-test
  (with-redefs [binning/bin-field->name #(str "_FieldName_" (second %))]
    (doseq [{:keys [input expected]} fill-empty-bins-examples]
      (is (= expected
             (select-keys
              (:query (binning/fill-empty-bins input))
              [:breakout :joins]))))))
