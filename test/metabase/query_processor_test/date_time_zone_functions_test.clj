(ns metabase.query-processor-test.date-time-zone-functions-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.test :as mt]
            [metabase.util.date-2 :as u.date]))

(defn test-date-extract
  [{:keys [aggregation breakout expressions fields filter limit]}]
  (if breakout
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :filter      filter
                                   :breakout    breakout})
         (mt/formatted-rows [int int]))
    (->> (mt/run-mbql-query times {:expressions expressions
                                   :aggregation aggregation
                                   :limit       limit
                                   :filter      filter
                                   :fields      fields})
         (mt/formatted-rows [int]))))

(mt/defdataset times-mixed
  [["times" [{:field-name "index"
              :base-type :type/Integer}
             {:field-name "dt"
              :base-type :type/DateTime}
             {:field-name "d"
              :base-type :type/Date}
             {:field-name "as_dt"
              :base-type :type/Text
              :effective-type :type/DateTime
              :coercion-strategy :Coercion/ISO8601->DateTime}
             {:field-name "as_d"
              :base-type :type/Text
              :effective-type :type/Date
              :coercion-strategy :Coercion/ISO8601->Date}]
    [[1 #t "2004-03-19 09:19:09" #t "2004-03-19" "2004-03-19 09:19:09" "2004-03-19"]
     [2 #t "2008-06-20 10:20:10" #t "2008-06-20" "2008-06-20 10:20:10" "2008-06-20"]
     [3 #t "2012-11-21 11:21:11" #t "2012-11-21" "2012-11-21 11:21:11" "2012-11-21"]
     [4 #t "2012-11-21 11:21:11" #t "2012-11-21" "2012-11-21 11:21:11" "2012-11-21"]]]])

(def ^:private date-extraction-op->-unit
  {:second      :second-of-minute
   :minute      :minute-of-hour
   :hour        :hour-of-day
   :day-of-week :day-of-week
   :day         :day-of-month
   :week        :week-of-year
   :month       :month-of-year
   :quarter     :quarter-of-year
   :year        :year})

(defn- extract
  [x unit]
  (u.date/extract x (date-extraction-op->-unit unit)))

(deftest extraction-function-tests
  (mt/dataset times-mixed
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :date-extraction) :mongo)
      (testing "with datetime columns"
        (doseq [[col-type field-id] [[:datetime (mt/id :times :dt)] [:text-as-datetime (mt/id :times :as_dt)]]
                unit                [:year :quarter :month :day :day-of-week :hour :minute :second]
                [expected query]
                [[[[(extract #t "2004-03-19 09:19:09" unit)] [(extract #t "2008-06-20 10:20:10" unit)]
                   [(extract #t "2012-11-21 11:21:11" unit)] [(extract #t "2012-11-21 11:21:11" unit)]]
                  {:expressions {"expr" [:datetime-extract [:field field-id nil] unit]}
                   :fields      [[:expression "expr"]]}]

                 [[[(extract #t "2004-03-19 09:19:09" unit)] [(extract #t "2008-06-20 10:20:10" unit)]
                   [(extract #t "2012-11-21 11:21:11" unit)] [(extract #t "2012-11-21 11:21:11" unit)]]
                  {:aggregation [[:datetime-extract [:field field-id nil] unit]]}]

                 [(into [] (frequencies [(extract #t "2004-03-19 09:19:09" unit) (extract #t "2008-06-20 10:20:10" unit)
                                         (extract #t "2012-11-21 11:21:11" unit) (extract #t "2012-11-21 11:21:11" unit)]))
                  {:expressions {"expr" [:datetime-extract [:field field-id nil] unit]}
                   :aggregation [[:count]]
                   :breakout    [[:expression "expr"]]}]]]
          (testing (format "extract %s function works as expected on %s column for driver %s" unit col-type driver/*driver*)
            (is (= (set expected) (set (test-date-extract query)))))))

     (testing "with date columns"
       (doseq [[col-type field-id] [[:date (mt/id :times :d)] [:text-as-date (mt/id :times :as_d)]]
               unit                [:year :quarter :month :day :day-of-week]
               [expected query]
               [[[[(extract #t "2004-03-19 09:19:09" unit)] [(extract #t "2008-06-20 10:20:10" unit)]
                  [(extract #t "2012-11-21 11:21:11" unit)] [(extract #t "2012-11-21 11:21:11" unit)]]
                 {:expressions {"expr" [:datetime-extract [:field field-id nil] unit]}
                  :fields      [[:expression "expr"]]}]

                [[[(extract #t "2004-03-19 09:19:09" unit)] [(extract #t "2008-06-20 10:20:10" unit)]
                  [(extract #t "2012-11-21 11:21:11" unit)] [(extract #t "2012-11-21 11:21:11" unit)]]
                 {:aggregation [[:datetime-extract [:field field-id nil] unit]]}]

                [(into [] (frequencies [(extract #t "2004-03-19 09:19:09" unit) (extract #t "2008-06-20 10:20:10" unit)
                                        (extract #t "2012-11-21 11:21:11" unit) (extract #t "2012-11-21 11:21:11" unit)]))
                 {:expressions {"expr" [:datetime-extract [:field field-id nil] unit]}
                  :aggregation [[:count]]
                  :breakout    [[:expression "expr"]]}]]]
         (testing (format "extract %s function works as expected on %s column for driver %s" unit col-type driver/*driver*)
           (is (= (set expected) (set (test-date-extract query))))))))

    ;; need to have seperate tests for mongo it doesn't have supports for casting yet
    (mt/test-driver :mongo
      (testing "with datetimes columns"
        (let [[col-type field-id] [:datetime (mt/id :times :dt)]]
          (doseq [unit             [:year :quarter :month :day :day-of-week :hour :minute :second]
                  [expected query]
                  [[[[(extract #t "2004-03-19 09:19:09" unit)] [(extract #t "2008-06-20 10:20:10" unit)]
                     [(extract #t "2012-11-21 11:21:11" unit)] [(extract #t "2012-11-21 11:21:11" unit)]]
                    {:expressions {"expr" [:datetime-extract [:field field-id nil] unit]}
                     :fields      [[:expression "expr"]]}]

                   [(into [] (frequencies [(extract #t "2004-03-19 09:19:09" unit) (extract #t "2008-06-20 10:20:10" unit)
                                           (extract #t "2012-11-21 11:21:11" unit) (extract #t "2012-11-21 11:21:11" unit)]))
                    {:expressions {"expr" [:datetime-extract[:field field-id nil] unit]}
                     :aggregation [[:count]]
                     :breakout    [[:expression "expr"]]}]]]
            (testing (format "extract %s function works as expected on %s column for driver %s" unit col-type driver/*driver*)
              (is (= (set expected) (set (test-date-extract query))))))))

      (testing "with date columns"
        (let [[col-type field-id] [:date (mt/id :times :d)]]
          (doseq [unit             [:year :quarter :month :day :day-of-week]
                  [expected query]
                  [[[[(extract #t "2004-03-19 09:19:09" unit)] [(extract #t "2008-06-20 10:20:10" unit)]
                     [(extract #t "2012-11-21 11:21:11" unit)] [(extract #t "2012-11-21 11:21:11" unit)]]
                    {:expressions {"expr" [:datetime-extract [:field field-id nil] unit]}
                     :fields      [[:expression "expr"]]}]

                   [(into [] (frequencies [(extract #t "2004-03-19 09:19:09" unit) (extract #t "2008-06-20 10:20:10" unit)
                                           (extract #t "2012-11-21 11:21:11" unit) (extract #t "2012-11-21 11:21:11" unit)]))
                    {:expressions {"expr" [:datetime-extract[:field field-id nil] unit]}
                     :aggregation [[:count]]
                     :breakout    [[:expression "expr"]]}]]]
            (testing (format "extract %s function works as expected on %s column for driver %s" unit col-type driver/*driver*)
              (is (= (set expected) (set (test-date-extract query)))))))))))


(deftest date-extraction-with-filter-expresion-tests
  (mt/test-drivers (mt/normal-drivers-with-feature :date-extraction)
    (mt/dataset times-mixed
      (doseq [[title expected query]
              [["Nested expression"
                [[2004]]
                {:expressions {"expr" [:abs [:datetime-extract [:field (mt/id :times :dt) nil] :year]]}
                 :filter      [:= [:field (mt/id :times :index) nil] 1]
                 :fields      [[:expression "expr"]]}]

               ["Nested with arithmetic"
                [[4008]]
                {:expressions {"expr" [:* [:datetime-extract [:field (mt/id :times :dt) nil] :year] 2]}
                 :filter      [:= [:field (mt/id :times :index) nil] 1]
                 :fields      [[:expression "expr"]]}]

               ["Filter using the extracted result - equality"
                [[1]]
                {:filter [:= [:datetime-extract [:field (mt/id :times :dt) nil] :year] 2004]
                 :fields [[:field (mt/id :times :index) nil]]}]

               ["Filter using the extracted result - comparable"
                [[1]]
                {:filter [:< [:datetime-extract [:field (mt/id :times :dt) nil] :year] 2005]
                 :fields [[:field (mt/id :times :index) nil]]}]

               ["Nested expression in fitler"
                [[1]]
                {:filter [:= [:* [:datetime-extract [:field (mt/id :times :dt) nil] :year] 2] 4008]
                 :fields [[:field (mt/id :times :index) nil]]}]]]
        (testing title
          (is (= expected (test-date-extract query))))))))
