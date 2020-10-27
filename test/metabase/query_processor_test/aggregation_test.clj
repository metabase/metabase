(ns metabase.query-processor-test.aggregation-test
  "Tests for MBQL aggregations."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor-test :as qp.test]
             [test :as mt]]
            [metabase.models.field :refer [Field]]
            [metabase.test
             [data :as data]
             [util :as tu]]))

(deftest no-aggregation-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Test that no aggregation just returns rows as-is."
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
              [3 "The Apple Pan" 11 34.0406 -118.428 2]
              [4 "Wurstküche" 29 33.9997 -118.465 2]
              [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
              [6 "The 101 Coffee Shop" 20 34.1054 -118.324 2]
              [7 "Don Day Korean Restaurant" 44 34.0689 -118.305 2]
              [8 "25°" 11 34.1015 -118.342 2]
              [9 "Krua Siri" 71 34.1018 -118.301 1]
              [10 "Fred 62" 20 34.1046 -118.292 2]]
             (mt/formatted-rows :venues
               (mt/run-mbql-query venues
                 {:limit 10, :order-by [[:asc $id]]})))))))

(deftest basic-aggregations-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "count aggregation"
      (is (= [[100]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]})))))

    (testing "sum aggregation"
      (is (= [[203]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum $price]]})))))

    (testing "avg aggregation"
      (is (= [[35.5059]]
             (mt/formatted-rows [4.0]
               (mt/run-mbql-query venues
                 {:aggregation [[:avg $latitude]]})))))

    (testing "distinct count aggregation"
      (is (= [[15]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query checkins
                 {:aggregation [[:distinct $user_id]]})))))))

(deftest standard-deviation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :standard-deviation-aggregations)
    (testing "standard deviation aggregations"
      (is (= {:cols [(qp.test/aggregate-col :stddev :venues :latitude)]
              :rows [[3.4]]}
             (qp.test/rows-and-cols
               (mt/format-rows-by [1.0]
                 (mt/run-mbql-query venues {:aggregation [[:stddev $latitude]]})))))))

  (mt/test-drivers (mt/normal-drivers-without-feature :standard-deviation-aggregations)
    (testing "Make sure standard deviations fail for drivers that don't support it"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"standard-deviation-aggregations is not supported by this driver"
           (mt/run-mbql-query venues
             {:aggregation [[:stddev $latitude]]}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIN & MAX                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest min-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [1]
           (mt/first-row
             (mt/format-rows-by [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:min $price]]})))))

    (is (= [[1 34.0071] [2 33.7701] [3 10.0646] [4 33.983]]
           (mt/formatted-rows [int 4.0]
             (mt/run-mbql-query venues
               {:aggregation [[:min $latitude]]
                :breakout    [$price]}))))))

(deftest max-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [4]
           (mt/first-row
             (mt/format-rows-by [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:max $price]]})))))

    (is (= [[1 37.8078] [2 40.7794] [3 40.7262] [4 40.7677]]
           (mt/formatted-rows [int 4.0]
             (mt/run-mbql-query venues
               {:aggregation [[:max $latitude]]
                :breakout    [$price]}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             MULTIPLE AGGREGATIONS                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest multiple-aggregations-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "two aggregations"
      (is (= [[100 203]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count] [:sum $price]]})))))

    (testing "three aggregations"
      (is (= [[2 100 203]]
             (mt/formatted-rows [int int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:avg $price] [:count] [:sum $price]]})))))))

(deftest multiple-aggregations-metadata-test
  ;; TODO - this isn't tested against Mongo because those driver doesn't currently work correctly with multiple
  ;; columns with the same name. It seems like it would be pretty easy to take the stuff we have for BigQuery and
  ;; generalize it so we can use it with Mongo
  ;;
  ;; TODO part 2 -- not sure if this is still the case?
  (mt/test-drivers (disj (mt/normal-drivers) :mongo)
    (testing "make sure that multiple aggregations of the same type have the correct metadata (#4003)"
      (is (= [(qp.test/aggregate-col :count)
              (assoc (qp.test/aggregate-col :count) :name "count_2", :field_ref [:aggregation 1])]
             (mt/cols
               (mt/run-mbql-query venues
                 {:aggregation [[:count] [:count]]})))))))


;;; ------------------------------------------------- CUMULATIVE SUM -------------------------------------------------

(deftest cumulate-sum-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "cum_sum w/o breakout should be treated the same as sum"
      (is (= [[120]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query users
                 {:aggregation [[:cum-sum $id]]})))))

    (testing " Simple cumulative sum where breakout field is same as cum_sum field"
      (is (= [[ 1   1]
              [ 2   3]
              [ 3   6]
              [ 4  10]
              [ 5  15]
              [ 6  21]
              [ 7  28]
              [ 8  36]
              [ 9  45]
              [10  55]
              [11  66]
              [12  78]
              [13  91]
              [14 105]
              [15 120]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query users
                 {:aggregation [[:cum-sum $id]]
                  :breakout    [$id]})))))

    (testing " Cumulative sum w/ a different breakout field"
      (is (= [["Broen Olujimi"        14]
              ["Conchúr Tihomir"      21]
              ["Dwight Gresham"       34]
              ["Felipinho Asklepios"  36]
              ["Frans Hevel"          46]
              ["Kaneonuskatew Eiran"  49]
              ["Kfir Caj"             61]
              ["Nils Gotam"           70]
              ["Plato Yeshua"         71]
              ["Quentin Sören"        76]
              ["Rüstem Hebel"         91]
              ["Shad Ferdynand"       97]
              ["Simcha Yan"          101]
              ["Spiros Teofil"       112]
              ["Szymon Theutrich"    120]]
             (mt/formatted-rows [str int]
               (mt/run-mbql-query users
                 {:aggregation [[:cum-sum $id]]
                  :breakout    [$name]})))))

    (testing " Cumulative sum w/ a different breakout field that requires grouping"
      (is (= [[1 1211]
              [2 4066]
              [3 4681]
              [4 5050]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:cum-sum $id]]
                  :breakout    [$price]})))))))


;;; ------------------------------------------------ CUMULATIVE COUNT ------------------------------------------------

(deftest cumulative-count-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "cumulative count aggregations"
      (testing "w/o breakout should be treated the same as count"
        (is (= {:rows [[15]]
                :cols [(qp.test/aggregate-col :cum-count :users :id)]}
               (qp.test/rows-and-cols
                 (mt/format-rows-by [int]
                   (mt/run-mbql-query users
                     {:aggregation [[:cum-count $id]]}))))))

      (testing "w/ breakout on field with distinct values"
        (is (= {:rows [["Broen Olujimi"        1]
                       ["Conchúr Tihomir"      2]
                       ["Dwight Gresham"       3]
                       ["Felipinho Asklepios"  4]
                       ["Frans Hevel"          5]
                       ["Kaneonuskatew Eiran"  6]
                       ["Kfir Caj"             7]
                       ["Nils Gotam"           8]
                       ["Plato Yeshua"         9]
                       ["Quentin Sören"       10]
                       ["Rüstem Hebel"        11]
                       ["Shad Ferdynand"      12]
                       ["Simcha Yan"          13]
                       ["Spiros Teofil"       14]
                       ["Szymon Theutrich"    15]]
                :cols [(qp.test/breakout-col :users :name)
                       (qp.test/aggregate-col :cum-count :users :id)]}
               (qp.test/rows-and-cols
                 (mt/format-rows-by [str int]
                   (mt/run-mbql-query users
                     {:aggregation [[:cum-count $id]]
                      :breakout    [$name]}))))))

      (testing "w/ breakout on field that requires grouping"
        (is (= {:cols [(qp.test/breakout-col :venues :price)
                       (qp.test/aggregate-col :cum-count :venues :id)]
                :rows [[1 22]
                       [2 81]
                       [3 94]
                       [4 100]]}
               (qp.test/rows-and-cols
                 (mt/format-rows-by [int int]
                   (mt/run-mbql-query venues
                     {:aggregation [[:cum-count $id]]
                      :breakout    [$price]})))))))))

(deftest field-settings-for-aggregate-fields-test
  (testing "Does `:settings` show up for aggregate Fields?"
    (tu/with-temp-vals-in-db Field (data/id :venues :price) {:settings {:is_priceless false}}
      (let [results (mt/run-mbql-query venues
                      {:aggregation [[:sum [:field-id $price]]]})]
        (is (= (assoc (qp.test/aggregate-col :sum :venues :price)
                      :settings {:is_priceless false})
               (or (-> results mt/cols first)
                   results)))))))

(deftest duplicate-aggregations-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Do we properly handle queries that have more than one of the same aggregation? (#5393)"
      (is (= [[5050 203]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum $id] [:sum $price]]})))))))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !                                                                                                                   !
;; !                    tests for named aggregations can be found in `expression-aggregations-test`                    !
;; !                                                                                                                   !
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
