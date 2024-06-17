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
   [metabase.test :as mt]))

(def ^:private pivot-rows-query
  "SELECT *
         FROM (SELECT 'AA' AS A UNION ALL SELECT 'AB' UNION ALL SELECT 'AC' UNION ALL SELECT 'AD')
   CROSS JOIN (SELECT 'BA' AS B UNION ALL SELECT 'BB' UNION ALL SELECT 'BC' UNION ALL SELECT 'BD')
   CROSS JOIN (SELECT 'CA' AS C UNION ALL SELECT 'CB' UNION ALL SELECT 'CC' UNION ALL SELECT 'CD')
   CROSS JOIN (SELECT 'DA' AS D UNION ALL SELECT 'DB' UNION ALL SELECT 'DC' UNION ALL SELECT 'DD')
   CROSS JOIN (SELECT 1 AS MEASURE)")

(def ^:private pivot-fields
  [[:field "A" {:base-type :type/Text}]
   [:field "B" {:base-type :type/Text}]
   [:field "C" {:base-type :type/Text}]
   [:field "D" {:base-type :type/Text}]
   [:field "MEASURE" {:base-type :type/Integer}]])

;; The Pivot Table Download/export test can be a bit confusing. I've kept a 'see pivot result' function in a comment at the end of this ns
;; If you eval/run that in your repl, you should be able to see the results (It's not too many rows so should print acceptably)
;; If you need to add assertions or fix up this test, that may be a helpful function to run!
(deftest ^:parallel pivot-export-test
  []
  (mt/dataset test-data
    (mt/with-temp [:model/Card {pivot-data-card-id :id}
                   {:dataset_query {:database (mt/id)
                                    :type     :native
                                    :native
                                    {:template-tags {}
                                     :query         pivot-rows-query}}
                    :result_metadata
                    (into [] (for [[_ field-name {:keys [base-type]}] pivot-fields]
                               {:name         field-name
                                :display_name field-name
                                :field_ref    [:field field-name {:base-type base-type}]
                                :base_type    base-type}))}
                   :model/Card {pivot-card-id :id}
                   {:display                :pivot
                    :visualization_settings {:pivot_table.column_split
                                             {:rows    [[:field "C" {:base-type :type/Text}]
                                                        [:field "D" {:base-type :type/Text}]]
                                              :columns [[:field "A" {:base-type :type/Text}]
                                                        [:field "B" {:base-type :type/Text}]]
                                              :values  [[:aggregation 0]]}}
                    :dataset_query          {:database (mt/id)
                                             :type     :query
                                             :query
                                             {:aggregation  [[:sum [:field "MEASURE" {:base-type :type/Integer}]]]
                                              :breakout
                                              [[:field "A" {:base-type :type/Text}]
                                               [:field "B" {:base-type :type/Text}]
                                               [:field "C" {:base-type :type/Text}]
                                               [:field "D" {:base-type :type/Text}]]
                                              :source-table (format "card__%s" pivot-data-card-id)}}}]
      (let [result (->> (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv?format_rows=false" pivot-card-id))
                        csv/read-csv)]
        (testing "Pivot CSV Exports look like a Pivoted Table"
          (testing "The Headers Properly indicate the pivot rows names."
            ;; Pivot Rows Header are Simply the Column names from the rows specified in
            ;; [:visualization_settings :pivot_table.column_split :rows]
            (is (= [["C" "D"]
                    ["C" "D"]]
                   [(take 2 (first result))
                    (take 2 (second result))])))
          (testing "The Headers Properly indicate the pivot column names."
            (let [[header1 header2]  (map set (take 2 result))
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
          (let [col1               (map first result)
                col2               (map second result)
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

(deftest ^:parallel multi-measure-pivot-tables-headers-test
  (testing "Pivot tables with multiple measures correctly include the measure titles in the final header row."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    [[:field (mt/id :products :created_at) {:base-type :type/DateTime, :temporal-unit :month}]],
                                                :columns [[:field (mt/id :products :category) {:base-type :type/Text}]],
                                                :values  [[:aggregation 0]
                                                          [:aggregation 1]]}}
                      :dataset_query          {:database (mt/id)
                                               :type     :query
                                               :query
                                               {:source-table (mt/id :products)
                                                :aggregation  [[:sum [:field (mt/id :products :price) {:base-type :type/Float}]]
                                                               [:avg [:field (mt/id :products :rating) {:base-type :type/Float}]]],
                                                :breakout     [[:field (mt/id :products :category) {:base-type :type/Text}]
                                                               [:field (mt/id :products :created_at) {:base-type :type/DateTime, :temporal-unit :month}]]}}}]
        (let [result (->> (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv?format_rows=false" pivot-card-id))
                          csv/read-csv)]
          (is (= [["Created At" "Doohickey" "Doohickey" "Gadget" "Gadget" "Gizmo" "Gizmo" "Widget" "Widget" "Row totals" "Row totals"]
                  ["Created At"
                   "Sum of Price"
                   "Average of Rating"
                   "Sum of Price"
                   "Average of Rating"
                   "Sum of Price"
                   "Average of Rating"
                   "Sum of Price"
                   "Average of Rating"
                   "Sum of Price"
                   "Average of Rating"]]
               (take 2 result))))))))

(deftest ^:parallel zero-column-pivot-tables-test
  (testing "Pivot tables with zero columns download correctly."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    [[:field (mt/id :products :created_at) {:base-type :type/DateTime :temporal-unit :month}]
                                                          [:field (mt/id :products :category) {:base-type :type/Text}]]
                                                :columns []
                                                :values  [[:aggregation 0]]}}
                      :dataset_query          {:database (mt/id)
                                               :type     :query
                                               :query
                                               {:source-table (mt/id :products)
                                                :aggregation  [[:sum [:field (mt/id :products :price) {:base-type :type/Float}]]]
                                                :breakout     [[:field (mt/id :products :category) {:base-type :type/Text}]
                                                               [:field (mt/id :products :created_at) {:base-type :type/DateTime :temporal-unit :month}]]}}}]
        (let [result (->> (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv?format_rows=false" pivot-card-id))
                          csv/read-csv)]
          (is (= [["Created At" "Category" "Sum of Price"]
                  ["2016-05-01T00:00:00Z" "Doohickey" "144.12"]
                  ["2016-05-01T00:00:00Z" "Gadget" "81.58"]
                  ["2016-05-01T00:00:00Z" "Gizmo" "75.09"]
                  ["2016-05-01T00:00:00Z" "Widget" "90.21"]
                  ["Totals for 2016-05-01T00:00:00Z" "" "391"]]
                 (take 6 result))))))))
