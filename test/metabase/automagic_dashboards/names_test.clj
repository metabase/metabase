(ns metabase.automagic-dashboards.names-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.automagic-dashboards.core :as magic]
   [metabase.automagic-dashboards.names :as names]
   [metabase.models.query :as query]
   [metabase.test :as mt]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]))

;;; ------------------- Datetime humanization (for chart and dashboard titles) -------------------

(deftest ^:parallel temporal-humanization-test
  (let [dt    #t "1990-09-09T12:30"
        t-str "1990-09-09T12:30:00"]
    (doseq [[unit expected] {:minute          (tru "at {0}" (t/format "h:mm a, MMMM d, YYYY" dt))
                             :hour            (tru "at {0}" (t/format "h a, MMMM d, YYYY" dt))
                             :day             (tru "on {0}" (t/format "MMMM d, YYYY" dt))
                             :week            (tru "in {0} week - {1}" (#'names/pluralize (u.date/extract dt :week-of-year)) (str (u.date/extract dt :year)))
                             :month           (tru "in {0}" (t/format "MMMM YYYY" dt))
                             :quarter         (tru "in Q{0} - {1}" (u.date/extract dt :quarter-of-year) (str (u.date/extract dt :year)))
                             :year            (t/format "YYYY" dt)
                             :day-of-week     (t/format "EEEE" dt)
                             :hour-of-day     (tru "at {0}" (t/format "h a" dt))
                             :month-of-year   (t/format "MMMM" dt)
                             :quarter-of-year (tru "Q{0}" (u.date/extract dt :quarter-of-year))
                             :minute-of-hour  (u.date/extract dt :minute-of-hour)
                             :day-of-month    (u.date/extract dt :day-of-month)
                             :week-of-year    (u.date/extract dt :week-of-year)}]
      (testing (format "unit = %s" unit)
        (is (= (str expected)
               (str (names/humanize-datetime t-str unit))))))))

(deftest ^:parallel pluralize-test
  (are [expected n] (= (str expected)
                       (str (names/pluralize n)))
    (tru "{0}st" 1)   1
    (tru "{0}nd" 22)  22
    (tru "{0}rd" 303) 303
    (tru "{0}th" 0)   0
    (tru "{0}th" 8)   8))

(deftest ^:parallel handlers-test
  (testing "Make sure we have handlers for all the units available"
    (doseq [unit (disj (set (concat u.date/extract-units u.date/truncate-units))
                       :iso-day-of-year :second-of-minute :millisecond)]
      (testing unit
        (is (some? (names/humanize-datetime "1990-09-09T12:30:00" unit)))))))


;;; ------------------- Cell titles -------------------
(deftest ^:parallel cell-title-test
  (mt/$ids venues
    (let [query (query/adhoc-query {:query    {:source-table (mt/id :venues)
                                               :aggregation  [:count]}
                                    :type     :query
                                    :database (mt/id)})
          root  (magic/->root query)]
      (testing "Should humanize equal filter"
        (is (= "number of Venues where Name is Test"
               ;; Test specifically the un-normalized form (metabase#15737)
               (names/cell-title root ["=" ["field" %name nil] "Test"]))))
      (testing "Should humanize greater than filter"
        (is (= "number of Venues where Name is greater than Test"
               (names/cell-title root [">" ["field" %name nil] "Test"]))))
      (testing "Should humanize at least filter"
        (is (= "number of Venues where Name is at least Test"
               (names/cell-title root [">=" ["field" %name nil] "Test"]))))
      (testing "Should humanize less than filter"
        (is (= "number of Venues where Name is less than Test"
               (names/cell-title root ["<" ["field" %name nil] "Test"]))))
      (testing "Should humanize at most filter"
        (is (= "number of Venues where Name is at most Test"
               (names/cell-title root ["<=" ["field" %name nil] "Test"]))))
      (testing "Should humanize and filter"
        (is (= "number of Venues where Name is Test and Price is 0"
               (names/cell-title root ["and"
                                       ["=" $name "Test"]
                                       ["=" $price 0]]))))
      (testing "Should humanize between filter"
        (is (= "number of Venues where Name is between A and J"
               (names/cell-title root ["between" $name "A", "J"]))))
      (testing "Should humanize inside filter"
        (is (= "number of Venues where Longitude is between 2 and 4; and Latitude is between 3 and 1"
               (names/cell-title root ["inside" (mt/$ids venues $latitude) (mt/$ids venues $longitude) 1 2 3 4])))))))
