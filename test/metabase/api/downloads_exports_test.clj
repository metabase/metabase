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
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [dk.ative.docjure.spreadsheet :as spreadsheet]
   [metabase.query-processor.streaming.csv :as qp.csv]
   [metabase.query-processor.streaming.xlsx :as qp.xlsx]
   [metabase.test :as mt])
  (:import
   (org.apache.poi.xssf.usermodel XSSFSheet)))

(set! *warn-on-reflection* true)

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
      (binding [qp.csv/*pivot-export-post-processing-enabled* true]
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
                       (first (last result))))))))))))

(deftest multi-measure-pivot-tables-headers-test
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
        (binding [qp.csv/*pivot-export-post-processing-enabled* true]
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
                   (take 2 result)))))))))

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
        (binding [qp.csv/*pivot-export-post-processing-enabled* true]
          (let [result (->> (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv?format_rows=false" pivot-card-id))
                            csv/read-csv)]
            (is (= [["Created At" "Category" "Sum of Price"]
                    ["2016-05-01T00:00:00Z" "Doohickey" "144.12"]
                    ["2016-05-01T00:00:00Z" "Gadget" "81.58"]
                    ["2016-05-01T00:00:00Z" "Gizmo" "75.09"]
                    ["2016-05-01T00:00:00Z" "Widget" "90.21"]
                    ["Totals for 2016-05-01T00:00:00Z" "" "391"]]
                   (take 6 result)))))))))

(deftest ^:parallel zero-row-pivot-tables-test
  (testing "Pivot tables with zero rows download correctly."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    []
                                                :columns [[:field (mt/id :products :category) {:base-type :type/Text}]]
                                                :values  [[:aggregation 0]]}}
                      :dataset_query          {:database (mt/id)
                                               :type     :query
                                               :query
                                               {:source-table (mt/id :products)
                                                :aggregation  [[:sum [:field (mt/id :products :price) {:base-type :type/Float}]]]
                                                :breakout     [[:field (mt/id :products :category) {:base-type :type/Text}]]}}}]
        (binding [qp.csv/*pivot-export-post-processing-enabled* true]
          (let [result (->> (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv?format_rows=false" pivot-card-id))
                            csv/read-csv)]
            (is (= [["Category" "Doohickey" "Gadget" "Gizmo" "Widget" "Row totals"]
                    ["Grand Totals" "2185.89" "3019.2" "2834.88" "3109.31" "11149.28"]]
                   result))))))))

(deftest ^:parallel zero-column-multiple-meausres-pivot-tables-test
  (testing "Pivot tables with zero columns and multiple measures download correctly."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    [[:field (mt/id :products :created_at) {:base-type :type/DateTime :temporal-unit :month}]
                                                          [:field (mt/id :products :category) {:base-type :type/Text}]]
                                                :columns []
                                                :values  [[:aggregation 0] [:aggregation 1]]}}
                      :dataset_query          {:database (mt/id)
                                               :type     :query
                                               :query
                                               {:source-table (mt/id :products)
                                                :aggregation  [[:sum [:field (mt/id :products :price) {:base-type :type/Float}]]
                                                               [:sum [:field (mt/id :products :price) {:base-type :type/Float}]]]
                                                :breakout     [[:field (mt/id :products :category) {:base-type :type/Text}]
                                                               [:field (mt/id :products :created_at) {:base-type :type/DateTime :temporal-unit :year}]]}}}]
        (binding [qp.csv/*pivot-export-post-processing-enabled* true]
          (let [result (->> (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv?format_rows=false" pivot-card-id))
                            csv/read-csv)]
            (is (= [["Created At" "Category" "Sum of Price" "Sum of Price"]
                    ["2016-01-01T00:00:00Z" "Doohickey" "632.14" "632.14"]
                    ["2016-01-01T00:00:00Z" "Gadget" "679.83" "679.83"]
                    ["2016-01-01T00:00:00Z" "Gizmo" "529.7" "529.7"]
                    ["2016-01-01T00:00:00Z" "Widget" "987.39" "987.39"]
                    ["Totals for 2016-01-01T00:00:00Z" "" "2829.06" "2829.06"]
                    ["2017-01-01T00:00:00Z" "Doohickey" "854.19" "854.19"]
                    ["2017-01-01T00:00:00Z" "Gadget" "1059.11" "1059.11"]
                    ["2017-01-01T00:00:00Z" "Gizmo" "1080.18" "1080.18"]
                    ["2017-01-01T00:00:00Z" "Widget" "1014.68" "1014.68"]
                    ["Totals for 2017-01-01T00:00:00Z" "" "4008.16" "4008.16"]
                    ["2018-01-01T00:00:00Z" "Doohickey" "496.43" "496.43"]
                    ["2018-01-01T00:00:00Z" "Gadget" "844.51" "844.51"]
                    ["2018-01-01T00:00:00Z" "Gizmo" "997.94" "997.94"]
                    ["2018-01-01T00:00:00Z" "Widget" "912.2" "912.2"]
                    ["Totals for 2018-01-01T00:00:00Z" "" "3251.08" "3251.08"]
                    ["2019-01-01T00:00:00Z" "Doohickey" "203.13" "203.13"]
                    ["2019-01-01T00:00:00Z" "Gadget" "435.75" "435.75"]
                    ["2019-01-01T00:00:00Z" "Gizmo" "227.06" "227.06"]
                    ["2019-01-01T00:00:00Z" "Widget" "195.04" "195.04"]
                    ["Totals for 2019-01-01T00:00:00Z" "" "1060.98" "1060.98"]
                    ["Grand Totals" "" "11149.28" "11149.28"]]
                   result))))))))

(deftest pivot-table-native-pivot-in-xlsx-test
  (testing "Pivot table xlsx downloads produce a 'native pivot' in the workbook."
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
                                                               [:avg [:field (mt/id :products :rating) {:base-type :type/Float}]]]
                                                :breakout     [[:field (mt/id :products :category) {:base-type :type/Text}]
                                                               [:field (mt/id :products :created_at) {:base-type :type/DateTime :temporal-unit :month}]]}}}]
        (binding [qp.xlsx/*pivot-export-post-processing-enabled* true]
          (let [result (mt/user-http-request :crowberto :post 200 (format "card/%d/query/xlsx?format_rows=false" pivot-card-id))
                pivot  (with-open [in (io/input-stream result)]
                         (->> (spreadsheet/load-workbook in)
                              (spreadsheet/select-sheet "pivot")
                              ((fn [s] (.getPivotTables ^XSSFSheet s)))))]
            (is (not (nil? pivot)))))))))

(deftest ^:parallel zero-column-native-pivot-tables-test
  (testing "Pivot tables with zero columns download correctly as xlsx."
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
        (binding [qp.xlsx/*pivot-export-post-processing-enabled* true]
          (let [result       (mt/user-http-request :crowberto :post 200 (format "card/%d/query/xlsx?format_rows=false" pivot-card-id))
                [pivot data] (with-open [in (io/input-stream result)]
                               (let [wb    (spreadsheet/load-workbook in)
                                     pivot (.getPivotTables ^XSSFSheet (spreadsheet/select-sheet "pivot" wb))
                                     data  (->> (spreadsheet/select-sheet "data" wb)
                                                spreadsheet/row-seq
                                                (mapv (fn [row] (->> (spreadsheet/cell-seq row)
                                                                     (mapv spreadsheet/read-cell)))))]
                                 [pivot data]))]
            (is (not (nil? pivot)))
            (is (= [["Category" "Created At" "Sum of Price"]
                    ["Doohickey" #inst "2016-05-01T00:00:00.000-00:00" 144.12]
                    ["Doohickey" #inst "2016-06-01T00:00:00.000-00:00" 82.92]
                    ["Doohickey" #inst "2016-07-01T00:00:00.000-00:00" 78.22]
                    ["Doohickey" #inst "2016-08-01T00:00:00.000-00:00" 71.09]
                    ["Doohickey" #inst "2016-09-01T00:00:00.000-00:00" 45.65]]
                   (take 6 data)))))))))

(deftest ^:parallel zero-row-native-pivot-tables-test
  (testing "Pivot tables with zero rows download correctly as xlsx."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    []
                                                :columns [[:field (mt/id :products :category) {:base-type :type/Text}]]
                                                :values  [[:aggregation 0]]}}
                      :dataset_query          {:database (mt/id)
                                               :type     :query
                                               :query
                                               {:source-table (mt/id :products)
                                                :aggregation  [[:sum [:field (mt/id :products :price) {:base-type :type/Float}]]]
                                                :breakout     [[:field (mt/id :products :category) {:base-type :type/Text}]]}}}]
        (binding [qp.xlsx/*pivot-export-post-processing-enabled* true]
          (let [result       (mt/user-http-request :crowberto :post 200 (format "card/%d/query/xlsx?format_rows=false" pivot-card-id))
                [pivot data] (with-open [in (io/input-stream result)]
                               (let [wb    (spreadsheet/load-workbook in)
                                     pivot (.getPivotTables ^XSSFSheet (spreadsheet/select-sheet "pivot" wb))
                                     data  (->> (spreadsheet/select-sheet "data" wb)
                                                spreadsheet/row-seq
                                                (mapv (fn [row] (->> (spreadsheet/cell-seq row)
                                                                     (mapv spreadsheet/read-cell)))))]
                                 [pivot data]))]
            (is (not (nil? pivot)))
            (is (= [["Category" "Sum of Price"]
                    ["Doohickey" 2185.89]
                    ["Gadget" 3019.2]
                    ["Gizmo" 2834.88]
                    ["Widget" 3109.31]]
                   (take 6 data)))))))))

(deftest ^:parallel pivot-table-exports-respect-dynamic-var-setting
  (testing "Pivot tables will export the 'classic' way by default for."
    (testing "for csv"
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
            (is (= [["Category" "Created At" "pivot-grouping" "Sum of Price"]
                    ["Doohickey" "2016-05-01T00:00:00Z" "0" "144.12"]
                    ["Doohickey" "2016-06-01T00:00:00Z" "0" "82.92"]
                    ["Doohickey" "2016-07-01T00:00:00Z" "0" "78.22"]
                    ["Doohickey" "2016-08-01T00:00:00Z" "0" "71.09"]
                    ["Doohickey" "2016-09-01T00:00:00Z" "0" "45.65"]]
                   (take 6 result)))))))
    (testing "for xlsx"
      (mt/dataset test-data
        (mt/with-temp [:model/Card {pivot-card-id :id}
                       {:display                :pivot
                        :visualization_settings {:pivot_table.column_split
                                                 {:rows    []
                                                  :columns [[:field (mt/id :products :category) {:base-type :type/Text}]]
                                                  :values  [[:aggregation 0]]}}
                        :dataset_query          {:database (mt/id)
                                                 :type     :query
                                                 :query
                                                 {:source-table (mt/id :products)
                                                  :aggregation  [[:sum [:field (mt/id :products :price) {:base-type :type/Float}]]]
                                                  :breakout     [[:field (mt/id :products :category) {:base-type :type/Text}]]}}}]
          (let [result (mt/user-http-request :crowberto :post 200 (format "card/%d/query/xlsx?format_rows=false" pivot-card-id))
                data   (with-open [in (io/input-stream result)]
                         (let [wb   (spreadsheet/load-workbook in)
                               data (->> (spreadsheet/select-sheet "Query result" wb)
                                         spreadsheet/row-seq
                                         (mapv (fn [row] (->> (spreadsheet/cell-seq row)
                                                              (mapv spreadsheet/read-cell)))))]
                           data))]
            (is (= [["Category" "pivot-grouping" "Sum of Price"]
                    ["Doohickey" 0.0 2185.89]
                    ["Gadget" 0.0 3019.2]
                    ["Gizmo" 0.0 2834.88]
                    ["Widget" 0.0 3109.31]
                    [nil 1.0 11149.28]]
                 (take 6 data)))))))))
