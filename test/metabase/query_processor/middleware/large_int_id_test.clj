(ns metabase.query-processor.middleware.large-int-id-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.large-int-id :as large-int-id]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel convert-ids
  (let [query (mt/mbql-query users
                             {:order-by [[:asc $id]]
                              :limit    5})]
    (testing "PKs become strings when middleware enabled"
      (is (= [["1" "Plato Yeshua"        "2014-04-01T08:30:00Z"]
              ["2" "Felipinho Asklepios" "2014-12-05T15:15:00Z"]
              ["3" "Kaneonuskatew Eiran" "2014-11-06T16:15:00Z"]
              ["4" "Simcha Yan"          "2014-01-01T08:30:00Z"]
              ["5" "Quentin Sören"       "2014-10-03T17:30:00Z"]]
             (mt/rows
              (qp/process-query (assoc query :middleware {:js-int-to-string? true}))))))
    (testing "PKs are left alone when middleware disabled (default)"
      (is (= [[1 "Plato Yeshua"        "2014-04-01T08:30:00Z"]
              [2 "Felipinho Asklepios" "2014-12-05T15:15:00Z"]
              [3 "Kaneonuskatew Eiran" "2014-11-06T16:15:00Z"]
              [4 "Simcha Yan"          "2014-01-01T08:30:00Z"]
              [5 "Quentin Sören"       "2014-10-03T17:30:00Z"]]
             (mt/rows
              (qp/process-query (assoc query :middleware {}))))))))

(deftest ^:parallel convert-ids-2
  (let [query (mt/mbql-query users
                {:fields   [$name]
                 :order-by [[:asc $name]]
                 :limit    5})]
    (testing "handle when there are no ID columns in the query but the middleware is enabled"
      (is (= [["Broen Olujimi"]
              ["Conchúr Tihomir"]
              ["Dwight Gresham"]
              ["Felipinho Asklepios"]
              ["Frans Hevel"]]
             (mt/rows
              (qp/process-query (assoc query :middleware {:js-int-to-string? true}))))))))

(deftest ^:parallel convert-ids-3
  (let [query (mt/mbql-query venues
                {:order-by [[:asc $id]]
                 :limit    5})]
    (testing "FKs become strings when middleware enabled"
      (is (= [["1" "Red Medicine"                 "4"  10.0646 -165.374 3]
              ["2" "Stout Burgers & Beers"        "11" 34.0996 -118.329 2]
              ["3" "The Apple Pan"                "11" 34.0406 -118.428 2]
              ["4" "Wurstküche"                   "29" 33.9997 -118.465 2]
              ["5" "Brite Spot Family Restaurant" "20" 34.0778 -118.261 2]]
             (mt/rows
              (qp/process-query (assoc query :middleware {:js-int-to-string? true}))))))
    (testing "FKs are left alone when middleware disabled (default)"
      (is (= [[1 "Red Medicine"                 4  10.0646 -165.374 3]
              [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
              [3 "The Apple Pan"                11 34.0406 -118.428 2]
              [4 "Wurstküche"                   29 33.9997 -118.465 2]
              [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
             (mt/rows
              (qp/process-query (assoc query :middleware {}))))))))

(deftest ^:parallel convert-ids-4
  (let [query (mt/mbql-query checkins
                {:fields   [$id $user_id->users.id $user_id->users.name $venue_id->venues.id $venue_id->venues.name]
                 :order-by [[:asc $id]]
                 :limit    5})]
    (testing "joins work correctly"
      (is (= [["1" "5" "Quentin Sören"       "12" "The Misfit Restaurant + Bar"]
              ["2" "1" "Plato Yeshua"        "31" "Bludso's BBQ"]
              ["3" "8" "Szymon Theutrich"    "56" "Philippe the Original"]
              ["4" "5" "Quentin Sören"       "4"  "Wurstküche"]
              ["5" "3" "Kaneonuskatew Eiran" "49" "Hotel Biron"]]
             (mt/rows
              (qp/process-query (assoc query :middleware {:js-int-to-string? true}))))))))

(deftest ^:parallel convert-ids-5
  (let [query (mt/mbql-query venues
                {:source-query {:source-table $$venues
                                :aggregation  [[:aggregation-options
                                                [:avg $id]
                                                {:name "some_generated_name", :display-name "My Cool Ag"}]]
                                :breakout     [$price]}})]
    ;; see comment in [[metabase.query-processor.middleware.large-int-id/convert-id-to-string]]
    ;; for why this value does not change
    (testing "aggregations are not converted to strings with middleware enabled"
      (is (= [[1 55]
              [2 48]
              [3 47]
              [4 61]]
             (mt/formatted-rows [int int]
               (qp/process-query (assoc query :middleware {:js-int-to-string? true}))))))
    (testing "aggregation does not convert to strings with middleware disabled (default)"
      (is (= [[1 55]
              [2 48]
              [3 47]
              [4 61]]
             (mt/formatted-rows [int int]
               (qp/process-query (assoc query :middleware {}))))))))

(defn- convert-id-to-string [rows]
  (qp.store/with-metadata-provider (mt/id)
    (let [query {:type       :query
                 :query      {:fields [[:field (mt/id :venues :id) nil]]}
                 :middleware {:js-int-to-string? true}}
          rff   (large-int-id/convert-id-to-string query (constantly conj))
          rf    (rff nil)]
      (transduce identity rf rows))))

(deftest ^:parallel different-row-types-test
  (testing "Middleware should work regardless of the type of each row (#13475)"
    (doseq [rows [[[1]
                   [Integer/MAX_VALUE]]
                  [(list 1)
                   (list Integer/MAX_VALUE)]
                  [(cons 1 nil)
                   (cons Integer/MAX_VALUE nil)]
                  [(lazy-seq [1])
                   (lazy-seq [Integer/MAX_VALUE])]]]
      (testing (format "rows = ^%s %s" (.getCanonicalName (class rows)) (pr-str rows))
        (is (= [["1"]
                ["2147483647"]]
               (convert-id-to-string rows)))))))

(deftest ^:parallel null-ids-as-strings
  (testing "Middleware should convert NULL IDs to nil (#13957)"
    (is (= [["1"]
            ["2147483647"]
            [nil]]
           (convert-id-to-string [[1]
                                  [Integer/MAX_VALUE]
                                  [nil]])))))
