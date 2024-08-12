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
   [metabase.public-settings :as public-settings]
   [metabase.pulse :as pulse]
   [metabase.query-processor.streaming.csv :as qp.csv]
   [metabase.query-processor.streaming.xlsx :as qp.xlsx]
   [metabase.test :as mt])
  (:import
   (org.apache.poi.xssf.usermodel XSSFSheet)
   (org.apache.poi.ss.usermodel DataFormatter)))

(def ^:private cell-formatter (DataFormatter.))
(defn- read-cell-with-formatting
  [c]
  (.formatCellValue cell-formatter c))

(defn- read-xlsx
  [result]
  (with-open [in (io/input-stream result)]
    (->> (spreadsheet/load-workbook in)
         (spreadsheet/select-sheet "Query result")
         (spreadsheet/row-seq)
         (mapv (fn [r]
                 (->>  (spreadsheet/cell-seq r)
                       (mapv read-cell-with-formatting)))))))

(defn- process-results
  [export-format results]
  (when (seq results)
    (case export-format
      :csv  (csv/read-csv results)
      :xlsx (read-xlsx results))))

(defn- card-download
  [{:keys [id] :as _card} export-format format-rows?]
  (->> (format "card/%d/query/%s?format_rows=%s" id (name export-format) format-rows?)
       (mt/user-http-request :crowberto :post 200)
       (process-results export-format)))

(defn- dashcard-download
  [card-or-dashcard export-format format-rows?]
  (letfn [(dashcard-download* [{dashcard-id  :id
                                card-id      :card_id
                                dashboard-id :dashboard_id}]
            (->> (format "dashboard/%d/dashcard/%d/card/%d/query/%s?format_rows=%s" dashboard-id dashcard-id card-id (name export-format) format-rows?)
                 (mt/user-http-request :crowberto :post 200)
                 (process-results export-format)))]
      (if (contains? card-or-dashcard :dashboard_id)
        (dashcard-download* card-or-dashcard)
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                       :model/DashboardCard dashcard {:dashboard_id dashboard-id
                                                      :card_id      (:id card-or-dashcard)}]
          (dashcard-download* dashcard)))))

(defn- run-pulse-and-return-attached-csv-data!
  "Simulate sending the pulse email, get the attached text/csv content, and parse into a map of
  attachment name -> column name -> column data"
  [pulse export-format]
  (mt/with-fake-inbox
    (mt/with-test-user nil
      (pulse/send-pulse! pulse))
    (->>
     (get-in @mt/inbox ["rasta@metabase.com" 0 :body])
     (keep
      (fn [{:keys [type content-type content]}]
              (when (and
                     (= :attachment type)
                     (= (format "text/%s" (name export-format)) content-type))
                (slurp content))))
     first)))

(defn- alert-attachment!
  [card export-format _format-rows?]
  (letfn [(alert-attachment* [pulse]
            (->> (run-pulse-and-return-attached-csv-data! pulse export-format)
                 (process-results export-format)))]
    (mt/with-temp [:model/Pulse {pulse-id :id
                                 :as      pulse} {:name "Test Alert"
                                                  :alert_condition "rows"}
                   :model/PulseCard _ (merge
                                       (when (= :csv  export-format) {:include_csv true})
                                       (when (= :json export-format) {:include_json true})
                                       (when (= :xlsx export-format) {:include_xlsx true})
                                       {:pulse_id pulse-id
                                        :card_id  (:id card)})
                   :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                               :pulse_id     pulse-id
                                                               :enabled      true}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                   :user_id          (mt/user->id :rasta)}]
      (alert-attachment* pulse))))

(defn- subscription-attachment!
  [card-or-dashcard export-format _format-rows?]
  (letfn [(subscription-attachment* [pulse]
            (->> (run-pulse-and-return-attached-csv-data! pulse export-format)
                 (process-results export-format)))]
    (if (contains? card-or-dashcard :dashboard_id)
      ;; dashcard
      (mt/with-temp [:model/Pulse {pulse-id :id
                                   :as      pulse} {:name         "Test Pulse"
                                   :dashboard_id (:dashboard_id card-or-dashcard)}
                     :model/PulseCard _ (merge
                                         (case export-format
                                           :csv  {:include_csv true}
                                           :json {:include_json true}
                                           :xlsx {:include_xlsx true})
                                         {:pulse_id          pulse-id
                                          :card_id           (:card_id card-or-dashcard)
                                          :dashboard_card_id (:id card-or-dashcard)})
                     :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                 :pulse_id     pulse-id
                                                                 :enabled      true}
                     :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                     :user_id          (mt/user->id :rasta)}]
        (subscription-attachment* pulse))
      ;; card
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                             :card_id      (:id card-or-dashcard)}
                     :model/Pulse {pulse-id :id
                                   :as      pulse} {:name         "Test Pulse"
                                   :dashboard_id dashboard-id}
                     :model/PulseCard _ (merge
                                         (when (= :csv  export-format) {:include_csv true})
                                         (when (= :json export-format) {:include_json true})
                                         (when (= :xlsx export-format) {:include_xlsx true})
                                         {:pulse_id          pulse-id
                                          :card_id           (:id card-or-dashcard)
                                          :dashboard_card_id dashcard-id})
                     :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                 :pulse_id     pulse-id
                                                                 :enabled      true}
                     :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                     :user_id          (mt/user->id :rasta)}]
        (subscription-attachment* pulse)))))

(defn all-outputs!
  [card-or-dashcard export-format format-rows?]
  (merge
   (when-not (contains? card-or-dashcard :dashboard_id)
     {:card-download    (card-download card-or-dashcard export-format format-rows?)
      :alert-attachment (alert-attachment! card-or-dashcard export-format format-rows?)})
   {:dashcard-download       (card-download card-or-dashcard export-format format-rows?)
    :subscription-attachment (subscription-attachment! card-or-dashcard export-format format-rows?)}))

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

(deftest ^:parallel dashcard-viz-settings-downloads-test
  (testing "Dashcard visualization settings are respected in downloads."
    (testing "for csv"
      (mt/dataset test-data
        (mt/with-temp [:model/Card {card-id :id :as card}  {:display       :table
                                                            :dataset_query {:database (mt/id)
                                                                            :type     :query
                                                                            :query    {:source-table (mt/id :orders)}}
                                                            :visualization_settings
                                                            {:table.cell_column "SUBTOTAL"
                                                             :column_settings   {(format "[\"ref\",[\"field\",%d,null]]" (mt/id :orders :subtotal))
                                                                                 {:column_title "SUB CASH MONEY"}}}}
                       :model/Dashboard {dashboard-id :id} {}
                       :model/DashboardCard dashcard {:dashboard_id dashboard-id
                                                      :card_id      card-id
                                                      :visualization_settings
                                                      {:table.cell_column "TOTAL"
                                                       :column_settings   {(format "[\"ref\",[\"field\",%d,null]]" (mt/id :orders :total))
                                                                           {:column_title "CASH MONEY"}}}}]
          (let [card-result     (card-download card :csv true)
                dashcard-result (dashcard-download dashcard :csv true)
                card-header     ["ID" "User ID" "Product ID" "SUB CASH MONEY" "Tax"
                                 "Total" "Discount ($)" "Created At" "Quantity"]
                dashcard-header ["ID" "User ID" "Product ID" "SUB CASH MONEY" "Tax"
                                 "CASH MONEY" "Discount ($)" "Created At" "Quantity"]]
            (is (= {:card-download     card-header
                    :dashcard-download dashcard-header}
                   {:card-download     (first card-result)
                    :dashcard-download (first dashcard-result)}))))))))

(deftest dashcard-viz-settings-attachments-test
  (testing "Dashcard visualization settings are respected in subscription attachments."
    (testing "for csv"
      (mt/dataset test-data
        (mt/with-temp [:model/Card {card-id :id :as card} {:display       :table
                                                           :dataset_query {:database (mt/id)
                                                                           :type     :query
                                                                           :query    {:source-table (mt/id :orders)}}
                                                           :visualization_settings
                                                           {:table.cell_column "SUBTOTAL"
                                                            :column_settings   {(format "[\"ref\",[\"field\",%d,null]]" (mt/id :orders :subtotal))
                                                                                {:column_title "SUB CASH MONEY"}}}}
                       :model/Dashboard {dashboard-id :id} {}
                       :model/DashboardCard dashcard  {:dashboard_id dashboard-id
                                                       :card_id      card-id
                                                       :visualization_settings
                                                       {:table.cell_column "TOTAL"
                                                        :column_settings   {(format "[\"ref\",[\"field\",%d,null]]" (mt/id :orders :total))
                                                                            {:column_title "CASH MONEY"}}}}]
          (let [subscription-result (subscription-attachment! dashcard :csv true)
                alert-result        (alert-attachment! card :csv true)
                alert-header        ["ID" "User ID" "Product ID" "SUB CASH MONEY" "Tax"
                                     "Total" "Discount ($)" "Created At" "Quantity"]
                subscription-header ["ID" "User ID" "Product ID" "SUB CASH MONEY" "Tax"
                                     "CASH MONEY" "Discount ($)" "Created At" "Quantity"]]
            (is (= {:alert-attachment        alert-header
                    :subscription-attachment subscription-header}
                   {:alert-attachment        (first alert-result)
                    :subscription-attachment (first subscription-result)}))))))))

(deftest downloads-row-limit-test
  (testing "Downloads row limit works."
    (mt/with-temporary-setting-values [public-settings/download-row-limit 1050000]
      (mt/dataset test-data
        (mt/with-temp [:model/Card card {:display       :table
                                         :dataset_query {:database (mt/id)
                                                         :type     :native
                                                         :native   {:query "SELECT 1 as A FROM generate_series(1,1100000);"}}}]
          (let [results (all-outputs! card :csv true)]
            (is (= {:card-download           1050001
                    :alert-attachment        1050001
                    :dashcard-download       1050001
                    :subscription-attachment 1050001}
                     (update-vals results count))))))))
  (testing "Downloads row limit default works."
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:display       :table
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:query "SELECT 1 as A FROM generate_series(1,1100000);"}}}]
        (let [results (all-outputs! card :csv true)]
          (is (= {:card-download           1048576
                  :alert-attachment        1048576
                  :dashcard-download       1048576
                  :subscription-attachment 1048576}
                 (update-vals results count))))))))

(deftest ^:parallel model-viz-settings-downloads-test
  (testing "A model's visualization settings are respected in downloads."
    (testing "for csv"
      (mt/dataset test-data
        (mt/with-temp [:model/Card card  {:display                :table
                                          :type                   :model
                                          :dataset_query          {:database (mt/id)
                                                                   :type     :query
                                                                   :query    {:source-table (mt/id :orders)
                                                                              :limit        10}}
                                          :visualization_settings {:table.cell_column "SUBTOTAL"}
                                          :result_metadata        [{:description
                                                                    "The raw, pre-tax cost of the order."
                                                                    :semantic_type      :type/Currency
                                                                    :coercion_strategy  nil
                                                                    :name               "SUBTOTAL"
                                                                    :settings           {:currency_style "code"
                                                                                         :currency       "CAD"
                                                                                         :scale          0.01}
                                                                    :fk_target_field_id nil
                                                                    :field_ref          [:field (mt/id :orders :subtotal) nil]
                                                                    :effective_type     :type/Float
                                                                    :id                 (mt/id :orders :subtotal)
                                                                    :visibility_type    :normal
                                                                    :display_name       "Subtotal"
                                                                    :base_type          :type/Float}]}]
          (let [card-result     (card-download card :csv true)
                dashcard-result (dashcard-download card :csv true)]
            (is (= {:card-download     ["Subtotal (CAD)" "0.38"]
                    :dashcard-download ["Subtotal (CAD)" "0.38"]}
                   {:card-download     (mapv #(nth % 3) (take 2 card-result))
                    :dashcard-download (mapv #(nth % 3) (take 2 dashcard-result))}))))))))

(deftest column-settings-on-aggregated-columns-test
  (testing "Column settings on aggregated columns are applied"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card  {:display                :table
                                        :type                   :model
                                        :dataset_query          {:database (mt/id)
                                                                 :type     :query
                                                                 :query    {:source-table (mt/id :products)
                                                                            :aggregation  [[:sum [:field (mt/id :products :price) {:base-type :type/Float}]]]
                                                                            :breakout     [[:field (mt/id :products :category) {:base-type :type/Text}]]
                                                                            :limit        10}}
                                        :visualization_settings {:column_settings
                                                                 {"[\"name\",\"sum\"]"
                                                                  {:number_style       "currency"
                                                                   :currency           "CAD"
                                                                   :currency_style     "name"
                                                                   :currency_in_header false}}}}]
        (testing "for csv"
          (is (= "2,185.89 Canadian dollars"
                 (-> (card-download card :csv true) second second))))
        (testing "for xlsx (#43039)"
          (is (= "2,185.89 Canadian dollars"
                 (-> (card-download card :xlsx true) second second))))))))

(deftest table-metadata-affects-column-formatting-properly
  (testing "A Table's configured metadata (eg. Semantic Type of currency) can affect column formatting"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card  {:display                :table
                                        :type                   :model
                                        :dataset_query          {:database (mt/id)
                                                                 :type     :query
                                                                 :query    {:source-table (mt/id :orders)
                                                                            :filter       [:not-null [:field (mt/id :orders :discount) {:base-type :type/Float}]]
                                                                            :limit        1}}
                                        :visualization_settings {:table.columns
                                                                 [{:name "ID" :enabled false}
                                                                  {:name "USER_ID" :enabled false}
                                                                  {:name "PRODUCT_ID" :enabled false}
                                                                  {:name "SUBTOTAL" :enabled false}
                                                                  {:name "TAX" :enabled false}
                                                                  {:name "TOTAL" :enabled false}
                                                                  {:name "DISCOUNT" :enabled true}
                                                                  {:name "CREATED_AT" :enabled false}
                                                                  {:name "QUANTITY" :enabled false}]
                                                                 :table.cell_column "SUBTOTAL"
                                                                 :column_settings   {(format "[\"ref\",[\"field\",%s,null]]" (mt/id :orders :discount))
                                                                                     {:currency_in_header false}}}}]
        (testing "for csv"
          (is (= [["Discount"] ["$6.42"]]
                 (-> (card-download card :csv true)))))
        (testing "for xlsx"
          ;; the [$$] part will appear as $ when you open the Excel file in a spreadsheet app
          (is (= [["Discount"] ["[$$]6.42"]]
                 (-> (card-download card :xlsx true)))))))))
