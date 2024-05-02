(ns metabase.api.downloads-exports-test
  "Tests for the various Download and Export features in the app.

  TODO: Add tests to cover the many places data can be exported or downloaded:
  - Question direct downloads
  - Unsaved question direct downloads
  - Dashcard direct downloads
  - Shared Question downloads
  - Static Embedding Dashboard/dashcard downloads
  - Dashboard Subscription Attachments
  - Alert attachments"
  (:require
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(def ^:private pivot-base-rows
  (for [a ["AA" "AB" "AC" "AD"]
        b ["BA" "BB" "BC" "BD"]
        c ["CA" "CB" "CC" "CD"]
        d ["DA" "DB" "DC" "DD"]]
    [a b c d 1]))

(tx/defdataset pivot-base-data
  [["pivot-base"
    [{:field-name "Cat A", :base-type :type/Text}
     {:field-name "Cat B", :base-type :type/Text}
     {:field-name "Cat C", :base-type :type/Text}
     {:field-name "Cat D", :base-type :type/Text}
     {:field-name "measure", :base-type :type/Quantity}]
    pivot-base-rows]])

;; The Pivot Table Download/export test can be a bit confusing. I've kept a 'see pivot result' function in a comment at the end of this ns
;; If you eval/run that in your repl, you should be able to see the results (It's not too many rows so should print acceptably)
;; If you need to add assertions or fix up this test, that may be a helpful function to run!
(deftest pivot-export-test
  []
  (mt/dataset pivot-base-data
    (mt/with-temp [:model/Card {card-id :id}
                   {:display                :pivot
                    :visualization_settings {:pivot_table.column_split
                                             {:rows    [[:field "CAT C" {:base-type :type/Text}]
                                                        [:field "CAT D" {:base-type :type/Text}]]
                                              :columns [[:field "CAT A" {:base-type :type/Text}]
                                                        [:field "CAT B" {:base-type :type/Text}]]
                                              :values  [[:aggregation 0]]}}
                    :dataset_query          {:database (mt/id)
                                             :type     :query
                                             :query
                                             {:aggregation  [[:sum [:field (mt/id :pivot-base :measure) {:base-type :type/Integer}]]]
                                              :breakout
                                              [[:field (mt/id :pivot-base "CAT A") {:base-type :type/Text}]
                                               [:field (mt/id :pivot-base "CAT B") {:base-type :type/Text}]
                                               [:field (mt/id :pivot-base "CAT C") {:base-type :type/Text}]
                                               [:field (mt/id :pivot-base "CAT D") {:base-type :type/Text}]]
                                              :source-table (mt/id :pivot-base)}}}]
      (let [result (->> (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv?format_rows=false" card-id))
                        csv/read-csv)]
        (testing "Pivot CSV Exports look like a Pivoted Table"
          (testing "The Headers Properly indicate the pivot rows names."
            ;; Pivot Rows Header are Simply the Column names from the rows specified in
            ;; [:visualization_settings :pivot_table.column_split :rows]
            (is (= [["Cat C" "Cat D"]
                    ["Cat C" "Cat D"]]
                   [(take 2 (first result))
                    (take 2 (second result))])))
          (testing "The Headers Properly indicate the pivot column names."
            (let [[header1 header2] (map set (take 2 result))
                  possible-vals-of-a #{"AA" "AB" "AC" "AD"}
                  possible-vals-of-b #{"BA" "BB" "BC" "BD"}]
              ;; In a Pivot Table, the Column headers are derived from the Possible Values in each Pivot Column
              ;; Since the test data used here has defined 2 Pivot Columns, there must be 2 Header rows
              ;; to fully capture all of the combinations of possible values for each pivot-col specified in
              ;; [:visualization_settings :pivot_table.column_split :columns]
              ;; To hopefully illustrate a bit, Let's consider that:
              ;; Cat A can have "AA" "AB" "AC" "AD"
              ;; Cat B can have "BA" "BB" "BC" "BD"
              ;; The first 4 Entries in Header 1 (excluding the Pivot Rows Display Names) will all be "AA"
              ;; And the first 4 Entries in Header 2 will be "BA" "BB" "BC" "BD"
              (is (= [["AA" "AA" "AA" "AA"]
                      ["BA" "BB" "BC" "BD"]]
                     [(take 4 (drop 2 (first result)))
                      (take 4 (drop 2 (second result)))]))
              ;; This combination logic would continue for each specified Pivot Column, but we'll just stick with testing 2
              ;; To keep things relatively easy to read and understand.
              (testing "The first Header only contains possible values from the first specified pivot column"
                (is (set/subset? possible-vals-of-a header1))
                (is (not (set/subset? possible-vals-of-b header1))))
              (testing "The second Header only contains possible values from the second specified pivot column"
                (is (set/subset? possible-vals-of-b header2))
                (is (not (set/subset? possible-vals-of-a header2))))
              (testing "The Headers also show the Row Totals header"
                (is (= ["Row totals"
                        "Row totals"]
                       (map last (take 2 result))))))))

        (testing "The Columns Properly indicate the pivot row names."
          (let [col1 (map first result)
                col2 (map second result)
                possible-vals-of-c #{"CA" "CB" "CC" "CD"}
                possible-vals-of-d #{"DA" "DB" "DC" "DD"}]
            ;; In a Pivot Table, the Row headers (the first columns in the result)
            ;; are derived from the Possible Values in each Pivot Row
            ;; Since the test data used here has defined 2 Pivot Rows, there are 2 Row Header columns
            ;; to fully capture all of the combinations of possible values for each pivot-row specified in
            ;; [:visualization_settings :pivot_table.column_split :rows]
            ;; To hopefully illustrate a bit, Let's consider that:
            ;; Cat C can have "CA" "CB" "CC" "CD"
            ;; Cat D can have "DA" "DB" "DC" "DD"
            ;; The first 4 Entries in col1 (excluding the Pivot Rows Display Names) will all be "CA"
            ;; And the first 4 Entries in col2 will be "DA" "DB" "DC" "DD"
            (is (= [["CA" "CA" "CA" "CA"]
                    ["DA" "DB" "DC" "DD"]]
                   [(take 4 (drop 2 col1))
                    (take 4 (drop 2 col2))]))
            ;; This combination logic would continue for each specified Pivot Row, but we'll just stick with testing 2
            ;; To keep things relatively easy to read and understand.
            (testing "The first Column only contains possible values from the first specified pivot row"
              (is (set/subset? possible-vals-of-c (set col1)))
              (is (not (set/subset? possible-vals-of-d (set col1)))))
            (testing "The second Column only contains possible values from the second specified pivot row"
              (is (set/subset? possible-vals-of-d (set col2)))
              (is (not (set/subset? possible-vals-of-c (set col2)))))
            (testing "The 1st Column also shows the Grand Total"
              (is (= "Grand Totals"
                     (first (last result)))))))))))


(comment

  ;; use this function to see the pivot results printed to your REPL. I find it helpful to have a look at the total expected output
  ;; to help make sure the test assertions (in pivot-export-test) make sense.
  (defn explore-pivot
    []
    (mt/dataset pivot-base-data
      (mt/with-temp [:model/Card {card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    [[:field "CAT C" {:base-type :type/Text}]
                                                          [:field "CAT D" {:base-type :type/Text}]]
                                                :columns [[:field "CAT A" {:base-type :type/Text}]
                                                          [:field "CAT B" {:base-type :type/Text}]]
                                                :values  [[:aggregation 0]]}}
                      :dataset_query          {:database (mt/id)
                                               :type     :query
                                               :query
                                               {:aggregation  [[:sum [:field (mt/id :pivot-base :measure) {:base-type :type/Integer}]]]
                                                :breakout
                                                [[:field (mt/id :pivot-base "CAT A") {:base-type :type/Text}]
                                                 [:field (mt/id :pivot-base "CAT B") {:base-type :type/Text}]
                                                 [:field (mt/id :pivot-base "CAT C") {:base-type :type/Text}]
                                                 [:field (mt/id :pivot-base "CAT D") {:base-type :type/Text}]]
                                                :source-table (mt/id :pivot-base)}}}]
        (let [result (->> (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv?format_rows=false" card-id))
                          csv/read-csv)]
          result))))
  )
