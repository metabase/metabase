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
   [clojure.data :as data]
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.math.combinatorics :as math.combo]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dk.ative.docjure.spreadsheet :as spreadsheet]
   [metabase.formatter.impl :as formatter]
   [metabase.pulse.send :as pulse.send]
   [metabase.pulse.test-util :as pulse.test-util]
   [metabase.query-processor.settings :as qp.settings]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (org.apache.poi.ss.usermodel DataFormatter)))

(set! *warn-on-reflection* true)

(def ^:private cell-formatter (DataFormatter.))

(defn- read-cell-with-formatting
  [c]
  (.formatCellValue ^DataFormatter cell-formatter c))

(defn- read-xlsx
  [result]
  (with-open [in (io/input-stream result)]
    (->> (spreadsheet/load-workbook in)
         (spreadsheet/select-sheet "Query result")
         (spreadsheet/row-seq)
         (mapv (fn [r]
                 (->>  (spreadsheet/cell-seq r)
                       (mapv read-cell-with-formatting)))))))

(defn- tabulate-maps
  [result]
  (let [ks (keys (first result))]
    (cons
     (mapv name ks)
     (map #(mapv % ks) result))))

(defn- process-results
  [export-format results]
  (when (seq results)
    (case export-format
      :csv  (cond-> results
              (not (map? results)) csv/read-csv)
      :xlsx (read-xlsx results)
      :json (tabulate-maps results))))

(defn card-download
  "Provides the result of the card download via the card api in `export-format`,
  formatting rows if `format-rows` is true, and pivoting the results if `pivot` is true."
  [{:keys [id] :as _card} {:keys [export-format format-rows pivot]}]
  (let [results (mt/user-http-request :crowberto :post 200
                                      (format "card/%d/query/%s" id (name export-format))
                                      {:format_rows   format-rows
                                       :pivot_results pivot})]
    (try
      (process-results export-format results)
      (catch Throwable e
        (throw (ex-info (format "Error processing results: %s" (ex-message e))
                        {:results results}
                        e))))))

(defn- unsaved-card-download
  [card {:keys [export-format format-rows pivot]}]
  (->> (mt/user-http-request :crowberto :post 200
                             (format "dataset/%s" (name export-format))
                             {:visualization_settings (:visualization_settings card)
                              :query (assoc (:dataset_query card)
                                            :was-pivot (boolean pivot)
                                            :info {:visualization-settings (:visualization_settings card)}
                                            :middleware
                                            {:userland-query? true})
                              :format_rows   format-rows
                              :pivot_results (boolean pivot)})
       (process-results export-format)))

(defn- public-question-download
  [card {:keys [export-format format-rows pivot]
         :or   {format-rows false
                pivot       false}}]
  (let [public-uuid  (str (random-uuid))
        cleaned-card (dissoc card :id :entity_id)]
    (mt/with-temp [:model/Card _ (assoc cleaned-card :public_uuid public-uuid)]
      (->> (mt/user-http-request :crowberto :get 200
                                 (format "public/card/%s/query/%s?format_rows=%s&pivot_results=%s"
                                         public-uuid (name export-format)
                                         format-rows
                                         pivot))
           (process-results export-format)))))

(defn- dashcard-download
  [card-or-dashcard {:keys [export-format format-rows pivot]}]
  (letfn [(dashcard-download* [{dashcard-id  :id
                                card-id      :card_id
                                dashboard-id :dashboard_id}]
            (->> (mt/user-http-request :crowberto :post 200
                                       (format "dashboard/%d/dashcard/%d/card/%d/query/%s" dashboard-id dashcard-id card-id (name export-format))
                                       {:format_rows   format-rows
                                        :pivot_results pivot})
                 (process-results export-format)))]
    (if (= (t2/model card-or-dashcard) :model/DashboardCard)
      (dashcard-download* card-or-dashcard)
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                     :model/DashboardCard dashcard {:dashboard_id dashboard-id
                                                    :card_id      (:id card-or-dashcard)}]
        (dashcard-download* dashcard)))))

(defn- public-dashcard-download
  [card-or-dashcard {:keys [export-format format-rows pivot]}]
  (let [public-uuid (str (random-uuid))]
    (letfn [(public-dashcard-download* [{dashcard-id  :id
                                         card-id      :card_id}]
              (->> (mt/user-http-request :crowberto :post 200
                                         (format "public/dashboard/%s/dashcard/%d/card/%d/%s"
                                                 public-uuid dashcard-id card-id (name export-format))
                                         {:format_rows   format-rows
                                          :pivot_results pivot})
                   (process-results export-format)))]
      (if (= :model/DashboardCard (t2/model card-or-dashcard))
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {:public_uuid public-uuid}]
          (public-dashcard-download* (assoc card-or-dashcard :dashboard_id dashboard-id)))
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {:public_uuid public-uuid}
                       :model/DashboardCard dashcard {:dashboard_id dashboard-id
                                                      :card_id      (:id card-or-dashcard)}]
          (public-dashcard-download* dashcard))))))

(defn- run-pulse-and-return-attached-csv-data!
  "Simulate sending the pulse email, get the attached text/csv content, and parse into a map of
  attachment name -> column name -> column data"
  [pulse export-format]
  (let [m    (update
              (mt/with-test-user nil
                (pulse.test-util/with-captured-channel-send-messages!
                  (pulse.send/send-pulse! pulse)))
              :channel/email vec)
        msgs (get-in m [:channel/email 0 :message])]
    (first (keep
            (fn [{:keys [type content-type content]}]
              (when (and
                     (= :attachment type)
                     (= (format "text/%s" (name export-format)) content-type))
                (slurp content)))
            msgs))))

(defn- alert-attachment!
  [card {:keys [export-format format-rows pivot]}]
  (letfn [(alert-attachment* [pulse]
            (->> (run-pulse-and-return-attached-csv-data! pulse export-format)
                 (process-results export-format)))]
    (mt/with-temp [:model/Pulse {pulse-id :id
                                 :as      pulse} {:name "Test Alert"
                                                  :alert_condition "rows"}
                   :model/PulseCard _ (merge
                                       (when (= :csv  export-format) {:include_csv true})
                                       (when (= :xlsx export-format) {:include_xls true})
                                       {:format_rows format-rows}
                                       {:pivot_results pivot}
                                       {:pulse_id pulse-id
                                        :card_id  (:id card)})
                   :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                               :pulse_id     pulse-id
                                                               :enabled      true}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                   :user_id          (mt/user->id :rasta)}]
      ;; TODO make sure this works for card notification
      (alert-attachment* pulse))))

(defn- subscription-attachment!
  [card-or-dashcard {:keys [export-format format-rows pivot]}]
  (letfn [(subscription-attachment* [pulse]
            (->> (run-pulse-and-return-attached-csv-data! pulse export-format)
                 (process-results export-format)))]
    (if (= :model/DashboardCard (t2/model card-or-dashcard))
      ;; dashcard
      (mt/with-temp [:model/Pulse {pulse-id :id
                                   :as      pulse} {:name         "Test Pulse"
                                                    :dashboard_id (:dashboard_id card-or-dashcard)}
                     :model/PulseCard _ (merge
                                         (when (= :csv  export-format) {:include_csv true})
                                         (when (= :xlsx export-format) {:include_xls true})
                                         {:format_rows format-rows}
                                         {:pivot_results pivot}
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
                                         (when (= :xlsx export-format) {:include_xls true})
                                         {:format_rows format-rows}
                                         {:pivot_results pivot}
                                         {:pulse_id          pulse-id
                                          :card_id           (:id card-or-dashcard)
                                          :dashboard_card_id dashcard-id})
                     :model/PulseChannel {pulse-channel-id :id} {:channel_type :email
                                                                 :pulse_id     pulse-id
                                                                 :enabled      true}
                     :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id
                                                     :user_id          (mt/user->id :rasta)}]
        (subscription-attachment* pulse)))))

(defn- all-downloads
  [card-or-dashcard opts]
  (merge
   (when-not (= (t2/model card-or-dashcard) :model/DashboardCard)
     {:unsaved-card-download    (unsaved-card-download card-or-dashcard opts)
      :card-download            (card-download card-or-dashcard opts)
      :public-question-download (public-question-download card-or-dashcard opts)})
   {:dashcard-download (card-download card-or-dashcard opts)
    :public-dashcard-download (public-dashcard-download card-or-dashcard opts)}))

(defn- all-outputs!
  [card-or-dashcard opts]
  (cond-> (merge
           (when-not (= (t2/model card-or-dashcard) :model/DashboardCard)
             {:unsaved-card-download    (delay (unsaved-card-download card-or-dashcard opts))
              :public-question-download (delay (public-question-download card-or-dashcard opts))
              :card-download            (delay (card-download card-or-dashcard opts))
              :alert-attachment         (delay (alert-attachment! card-or-dashcard opts))})
           {:dashcard-download        (delay (card-download card-or-dashcard opts))
            :public-dashcard-download (delay (public-dashcard-download card-or-dashcard opts))
            :subscription-attachment  (delay (subscription-attachment! card-or-dashcard opts))})
    (:except opts) (#(apply dissoc % (:except opts)))

    ;; format rows and pivot does not support alert, they're all off by default
    (or (:format-rows opts) (:pivot opts))
    (dissoc :alert-attachment)

    true (update-vals deref)))

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

(deftest simple-pivot-export-test
  (testing "Pivot table exports look pivoted"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CATEGORY"]
                                                :columns ["CREATED_AT"]
                                                :values  ["sum"]}
                                               :column_settings
                                               {"[\"name\",\"sum\"]" {:number_style       "currency"
                                                                      :currency_in_header false}}
                                               :pivot.condense_duplicate_totals true}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]]
                                                 :breakout    [$category
                                                               !year.created_at]})}]
        (testing "formatted"
          (is (= [[["Category" "2016" "2017" "2018" "2019" "Row totals"]
                   ["Doohickey" "$632.14" "$854.19" "$496.43" "$203.13" "$2,185.89"]
                   ["Gadget" "$679.83" "$1,059.11" "$844.51" "$435.75" "$3,019.20"]
                   ["Gizmo" "$529.70" "$1,080.18" "$997.94" "$227.06" "$2,834.88"]
                   ["Widget" "$987.39" "$1,014.68" "$912.20" "$195.04" "$3,109.31"]
                   ["Grand totals" "$2,829.06" "$4,008.16" "$3,251.08" "$1,060.98" "$11,149.28"]]
                  #{:unsaved-card-download :card-download :dashcard-download
                    :subscription-attachment
                    :public-question-download :public-dashcard-download}]
                 (->> (all-outputs! card {:export-format :csv :format-rows true :pivot true})
                      (group-by second)
                      ((fn [m] (update-vals m #(into #{} (mapv first %)))))
                      (apply concat)))))
        (testing "unformatted"
          (is (= [[["Category"
                    "2016-01-01T00:00:00Z"
                    "2017-01-01T00:00:00Z"
                    "2018-01-01T00:00:00Z"
                    "2019-01-01T00:00:00Z"
                    "Row totals"]
                   ["Doohickey" "632.14" "854.19" "496.43" "203.13" "2185.89"]
                   ["Gadget" "679.83" "1059.11" "844.51" "435.75" "3019.2"]
                   ["Gizmo" "529.7" "1080.18" "997.94" "227.06" "2834.88"]
                   ["Widget" "987.39" "1014.68" "912.2" "195.04" "3109.31"]
                   ["Grand totals" "2829.06" "4008.16" "3251.08" "1060.98" "11149.28"]]
                  #{:unsaved-card-download :card-download :dashcard-download
                    :subscription-attachment
                    :public-question-download :public-dashcard-download}]
                 (->> (all-outputs! card {:export-format :csv :format-rows false :pivot true})
                      (group-by second)
                      ((fn [m] (update-vals m #(into #{} (mapv first %)))))
                      (apply concat)))))
        (testing "only when `qp.settings/enable-pivoted-exports` is true (true by default)."
          (is (= [[["Category" "Created At: Year" "Sum of Price"]
                   ["Doohickey" "2016" "$632.14"]
                   ["Doohickey" "2017" "$854.19"]
                   ["Doohickey" "2018" "$496.43"]
                   ["Doohickey" "2019" "$203.13"]
                   ["Gadget" "2016" "$679.83"]
                   ["Gadget" "2017" "$1,059.11"]
                   ["Gadget" "2018" "$844.51"]
                   ["Gadget" "2019" "$435.75"]
                   ["Gizmo" "2016" "$529.70"]
                   ["Gizmo" "2017" "$1,080.18"]
                   ["Gizmo" "2018" "$997.94"]
                   ["Gizmo" "2019" "$227.06"]
                   ["Widget" "2016" "$987.39"]
                   ["Widget" "2017" "$1,014.68"]
                   ["Widget" "2018" "$912.20"]
                   ["Widget" "2019" "$195.04"]]
                  #{:unsaved-card-download :card-download :dashcard-download
                    :subscription-attachment
                    :public-question-download :public-dashcard-download}]
                 (mt/with-temporary-setting-values [qp.settings/enable-pivoted-exports false]
                   (->> (all-outputs! card {:export-format :csv :format-rows true :pivot true})
                        (group-by second)
                        ((fn [m] (update-vals m #(into #{} (mapv first %)))))
                        (apply concat))))))))))

(deftest simple-pivot-with-sum-and-average-export-test
  (testing "Pivot table exports look pivoted and can have multiple measures aggregated properly."
    (mt/dataset test-data
      (mt/with-temp [:model/Card card
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CATEGORY"]
                                                :columns ["CREATED_AT"]
                                                :values  ["sum" "avg"]}
                                               :column_settings
                                               {"[\"name\",\"sum\"]" {:number_style       "currency"
                                                                      :currency_in_header false}}
                                               :pivot.condense_duplicate_totals true}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]
                                                               [:avg $price]]
                                                 :breakout    [$category
                                                               !year.created_at]})}]
        (testing "formatted"
          (is (= [[["" "2016" "2016" "2017" "2017" "2018" "2018" "2019" "2019" "Row totals" "Row totals"]
                   ["Category"
                    "Sum of Price"
                    "Average of Price"
                    "Sum of Price"
                    "Average of Price"
                    "Sum of Price"
                    "Average of Price"
                    "Sum of Price"
                    "Average of Price"
                    "Sum of Price"
                    "Average of Price"]
                   ["Doohickey" "$632.14" "48.63" "$854.19" "50.25" "$496.43" "62.05" "$203.13" "50.78" "$2,185.89" "52.05"]
                   ["Gadget" "$679.83" "52.29" "$1,059.11" "55.74" "$844.51" "60.32" "$435.75" "62.25" "$3,019.20" "56.97"]
                   ["Gizmo" "$529.70" "58.86" "$1,080.18" "51.44" "$997.94" "58.7" "$227.06" "56.77" "$2,834.88" "55.59"]
                   ["Widget" "$987.39" "51.97" "$1,014.68" "56.37" "$912.20" "65.16" "$195.04" "65.01" "$3,109.31" "57.58"]
                   ["Grand totals"
                    "$2,829.06"
                    "52.39"
                    "$4,008.16"
                    "53.44"
                    "$3,251.08"
                    "61.34"
                    "$1,060.98"
                    "58.94"
                    "$11,149.28"
                    "55.75"]]
                  #{:unsaved-card-download :card-download :dashcard-download
                    :subscription-attachment
                    :public-question-download :public-dashcard-download}]
                 (->> (all-outputs! card {:export-format :csv :format-rows true :pivot true})
                      (group-by second)
                      ((fn [m] (update-vals m #(into #{} (mapv first %)))))
                      (apply concat)))))))))

(deftest simple-pivot-export-row-col-totals-test
  (testing "Pivot table csv exports respect row/column totals viz-settings"
    (doseq [row-totals? [#_true false]
            col-totals? [#_true false]]
      (mt/dataset test-data
        (mt/with-temp [:model/Card card
                       {:display                :pivot
                        :visualization_settings {:pivot_table.column_split
                                                 {:rows    ["CATEGORY"]
                                                  :columns ["CREATED_AT"]
                                                  :values  ["sum"]}
                                                 :pivot.show_row_totals    row-totals?
                                                 :pivot.show_column_totals col-totals?
                                                 :column_settings
                                                 {"[\"name\",\"sum\"]" {:number_style       "currency"
                                                                        :currency_in_header false}}}
                        :dataset_query          (mt/mbql-query products
                                                  {:aggregation [[:sum $price]]
                                                   :breakout    [$category
                                                                 !year.created_at]})}]
          (testing (format "formatted with row-totals: %s and col-totals: %s" row-totals? col-totals?)
            (is (= [(keep
                     (fn [row]
                       (when row
                         (if row-totals?
                           row
                           (vec (drop-last row)))))
                     [["Category" "2016" "2017" "2018" "2019" "Row totals"]
                      ["Doohickey" "$632.14" "$854.19" "$496.43" "$203.13" "$2,185.89"]
                      ["Gadget" "$679.83" "$1,059.11" "$844.51" "$435.75" "$3,019.20"]
                      ["Gizmo" "$529.70" "$1,080.18" "$997.94" "$227.06" "$2,834.88"]
                      ["Widget" "$987.39" "$1,014.68" "$912.20" "$195.04" "$3,109.31"]
                      (when col-totals? ["Grand totals" "$2,829.06" "$4,008.16" "$3,251.08" "$1,060.98" "$11,149.28"])])
                    #{:unsaved-card-download :card-download :dashcard-download
                      :subscription-attachment
                      :public-question-download :public-dashcard-download}]
                   (->> (all-outputs! card {:export-format :csv :format-rows true :pivot true})
                        (group-by second)
                        ((fn [m] (update-vals m #(into #{} (mapv first %)))))
                        (apply concat))))))))))

(deftest ^:parallel pivot-with-multiple-columns-no-row-totals
  (testing "A pivot table with multiple pivot columns and no row totals can export correctly (#54530)"
    (let [pivot-rows-query "SELECT *
                              FROM (SELECT 4 AS A UNION ALL SELECT 3)
                              CROSS JOIN (SELECT 'BA' AS B)
                              CROSS JOIN (SELECT 3 AS C UNION ALL SELECT 4)
                              CROSS JOIN (SELECT 1 AS MEASURE)"]
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
                       :model/Card pivot-card
                       {:display                :pivot
                        :visualization_settings {:pivot_table.column_split
                                                 {:rows    ["C"]
                                                  :columns ["A" "B"]
                                                  :values  ["sum"]}
                                                 :pivot.show_row_totals    false
                                                 :pivot.show_column_totals false}
                        :dataset_query          (mt/mbql-query nil
                                                  {:aggregation  [[:sum [:field "MEASURE" {:base-type :type/Integer}]]]
                                                   :breakout
                                                   [[:field "A" {:base-type :type/Integer}]
                                                    [:field "B" {:base-type :type/Text}]
                                                    [:field "C" {:base-type :type/Integer}]]
                                                   :source-table (format "card__%s" pivot-data-card-id)})}]
          (let [result (card-download pivot-card {:export-format :csv :pivot true})]
            (is
             (= [["" "3" "4"]
                 ["C" "BA" "BA"]
                 ["3" "1" "1"]
                 ["4" "1" "1"]]
                result))))))))

(deftest ^:parallel simple-pivot-export-works-even-with-table-column-ordering-test
  (testing "Pivot table exports are not affected by table sort settings"
    (testing "Try some permutations with csv"
      (doseq [col-order   (math.combo/permutations [{:name "CATEGORY"}
                                                    {:name "CREATED_AT"}
                                                    {:name "sum"}])
              col-enabled [true false]]
        (mt/dataset test-data
          (mt/with-temp [:model/Card card
                         {:display                :pivot
                          :visualization_settings {:table.columns
                                                   ;; the :table.columns key specifies order/enabled status of columns for regular table viz
                                                   ;; and should not cause pivot exports to fail.
                                                   (mapv #(assoc % :enabled col-enabled) col-order)
                                                   :pivot_table.column_split
                                                   {:rows    ["CATEGORY"]
                                                    :columns ["CREATED_AT"]
                                                    :values  ["sum"]}
                                                   :column_settings
                                                   {"[\"name\",\"sum\"]" {:number_style       "currency"
                                                                          :currency_in_header false}}
                                                   :pivot.condense_duplicate_totals true}
                          :dataset_query          (mt/mbql-query products
                                                    {:aggregation [[:sum $price]]
                                                     :breakout    [$category
                                                                   !year.created_at]})}]
            (testing "they work regardless of the table.columns setting"
              (is (= [["Category" "2016" "2017" "2018" "2019" "Row totals"]
                      ["Doohickey" "$632.14" "$854.19" "$496.43" "$203.13" "$2,185.89"]
                      ["Gadget" "$679.83" "$1,059.11" "$844.51" "$435.75" "$3,019.20"]
                      ["Gizmo" "$529.70" "$1,080.18" "$997.94" "$227.06" "$2,834.88"]
                      ["Widget" "$987.39" "$1,014.68" "$912.20" "$195.04" "$3,109.31"]
                      ["Grand totals" "$2,829.06" "$4,008.16" "$3,251.08" "$1,060.98" "$11,149.28"]]
                     (card-download card {:export-format :csv :format-rows true :pivot true}))))))))))

(deftest ^:parallel pivot-export-test
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
                   :model/Card pivot-card
                   {:display                :pivot
                    :visualization_settings {:pivot_table.column_split
                                             {:rows    ["C" "D"]
                                              :columns ["A" "B"]
                                              :values  ["sum"]}
                                             :pivot.condense_duplicate_totals true}
                    :dataset_query          (mt/mbql-query nil
                                              {:aggregation  [[:sum [:field "MEASURE" {:base-type :type/Integer}]]]
                                               :breakout
                                               [[:field "A" {:base-type :type/Text}]
                                                [:field "B" {:base-type :type/Text}]
                                                [:field "C" {:base-type :type/Text}]
                                                [:field "D" {:base-type :type/Text}]]
                                               :source-table (format "card__%s" pivot-data-card-id)})}]
      (let [result (card-download pivot-card {:export-format :csv :pivot true})]
        (testing "Pivot CSV Exports look like a Pivoted Table"
          (testing "The Headers Properly indicate the pivot rows names."
            ;; Pivot rows header are simply the column names from the rows specified in
            ;; [:visualization_settings :pivot_table.column_split :rows]
            ;; Because there are two pivot columns, the pivot row headers are only in the second row of the CSV.
            (is (= [["" ""]
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
              (testing "The first header only contains possible values from the first specified pivot column"
                (is (set/subset? possible-vals-of-a header1))
                (is (not (set/subset? possible-vals-of-b header1))))
              (testing "The second header only contains possible values from the second specified pivot column"
                (is (set/subset? possible-vals-of-b header2))
                (is (not (set/subset? possible-vals-of-a header2))))
              (testing "The headers also show the Row Totals header"
                (is (= "Row totals"
                       (last (first result))))))))

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
              (is (= "Grand totals"
                     (first (last result)))))))))))

(deftest multi-measure-pivot-tables-headers-test
  (testing "Pivot tables with multiple measures correctly include the measure titles in the final header row."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CREATED_AT"]
                                                :columns ["CATEGORY"]
                                                :values  ["sum" "avg"]}}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]
                                                               [:avg $rating]]
                                                 :breakout    [$category !year.created_at]})}]
        (let [result (->> (mt/user-http-request :crowberto :post 200
                                                (format "card/%d/query/csv" pivot-card-id)
                                                {:format_rows   true
                                                 :pivot_results true})
                          csv/read-csv)]
          (is (= [[""
                   "Doohickey" "Doohickey"
                   "Gadget" "Gadget"
                   "Gizmo" "Gizmo"
                   "Widget" "Widget"
                   "Row totals" "Row totals"]
                  ["Created At: Year"
                   "Sum of Price" "Average of Rating"
                   "Sum of Price" "Average of Rating"
                   "Sum of Price" "Average of Rating"
                   "Sum of Price" "Average of Rating"
                   "Sum of Price" "Average of Rating"]]
                 (take 2 result))))))))

(deftest ^:parallel pivot-export-aggregations-test
  (testing "Row and Column Values that collide with indices don't break (#50207)"
    (testing "Other aggregations will produce the correct values in Totals rows."
      (let [pivot-rows-query "SELECT *
                              FROM (SELECT 4 AS A UNION ALL SELECT 3)
                              CROSS JOIN (SELECT 'BA' AS B)
                              CROSS JOIN (SELECT 3 AS C UNION ALL SELECT 4)
                              CROSS JOIN (SELECT 1 AS MEASURE)"]
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
                         :model/Card pivot-card
                         {:display                :pivot
                          :visualization_settings {:pivot_table.column_split
                                                   {:rows    ["B" "C"]
                                                    :columns ["A"]
                                                    :values  ["sum"]}}
                          :dataset_query          (mt/mbql-query nil
                                                    {:aggregation  [[:sum [:field "MEASURE" {:base-type :type/Integer}]]]
                                                     :breakout
                                                     [[:field "A" {:base-type :type/Integer}]
                                                      [:field "B" {:base-type :type/Text}]
                                                      [:field "C" {:base-type :type/Integer}]]
                                                     :source-table (format "card__%s" pivot-data-card-id)})}]
            (let [result (card-download pivot-card {:export-format :csv :pivot true})]
              (is
               (= [["B" "C" "3" "4" "Row totals"]
                   ["BA" "3" "1" "1" "2"]
                   ["BA" "4" "1" "1" "2"]
                   ["Totals for BA"  "" "2" "2" "4"]]
                  result)))))))))

(deftest ^:parallel zero-column-pivot-tables-test
  (testing "Pivot tables with zero columns download correctly."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CREATED_AT" "CATEGORY"]
                                                :columns []
                                                :values  ["sum"]}}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]]
                                                 :breakout    [$category !month.created_at]})}]
        (let [result (->> (mt/user-http-request :crowberto :post 200
                                                (format "card/%d/query/csv" pivot-card-id)
                                                {:format_rows   true
                                                 :pivot_results true})
                          csv/read-csv)]
          (is (= [["Created At: Month" "Category" "Sum of Price"]
                  ["May, 2016" "Doohickey" "144.12"]
                  ["May, 2016" "Gadget" "81.58"]
                  ["May, 2016" "Gizmo" "75.09"]
                  ["May, 2016" "Widget" "90.21"]
                  ["Totals for May, 2016" "" "391"]]
                 (take 6 result))))))))

(deftest ^:parallel zero-row-pivot-tables-test
  (testing "Pivot tables with zero rows download correctly."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    []
                                                :columns ["CATEGORY"]
                                                :values  ["sum"]}}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]]
                                                 :breakout    [$category]})}]
        (let [result (->> (mt/user-http-request :crowberto :post 200
                                                (format "card/%d/query/csv" pivot-card-id)
                                                {:format_rows   false
                                                 :pivot_results true})
                          csv/read-csv)]
          (is (= [["Doohickey" "Gadget" "Gizmo" "Widget" "Row totals"]
                  ["2185.89" "3019.2" "2834.88" "3109.31" "11149.28"]]
                 result)))))))

(deftest ^:parallel zero-column-multiple-measures-pivot-tables-test
  (testing "Pivot tables with zero columns and multiple measures download correctly."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CATEGORY" "CREATED_AT"]
                                                :columns []
                                                :values  ["sum" "count"]}}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]
                                                               [:count]]
                                                 :breakout    [$category !year.created_at]})}]
        (let [result (->> (mt/user-http-request :crowberto :post 200
                                                (format "card/%d/query/csv" pivot-card-id)
                                                {:format_rows   true
                                                 :pivot_results true})
                          csv/read-csv)]
          (is (= [["Category" "Created At: Year" "Sum of Price" "Count"]
                  ["Doohickey" "2016" "632.14" "13"]
                  ["Doohickey" "2017" "854.19" "17"]
                  ["Doohickey" "2018" "496.43" "8"]
                  ["Doohickey" "2019" "203.13" "4"]
                  ["Totals for Doohickey" "" "2,185.89" "42"]
                  ["Gadget" "2016" "679.83" "13"]
                  ["Gadget" "2017" "1,059.11" "19"]
                  ["Gadget" "2018" "844.51" "14"]
                  ["Gadget" "2019" "435.75" "7"]
                  ["Totals for Gadget" "" "3,019.2" "53"]
                  ["Gizmo" "2016" "529.7" "9"]
                  ["Gizmo" "2017" "1,080.18" "21"]
                  ["Gizmo" "2018" "997.94" "17"]
                  ["Gizmo" "2019" "227.06" "4"]
                  ["Totals for Gizmo" "" "2,834.88" "51"]
                  ["Widget" "2016" "987.39" "19"]
                  ["Widget" "2017" "1,014.68" "18"]
                  ["Widget" "2018" "912.2" "14"]
                  ["Widget" "2019" "195.04" "3"]
                  ["Totals for Widget" "" "3,109.31" "54"]
                  ["Grand totals" "" "11,149.28" "200"]]
                 result)))))))

(deftest pivot-table-in-xlsx-test
  (testing "Pivot table xlsx downloads use the pivoted shape"
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CREATED_AT"]
                                                :columns ["CATEGORY"]
                                                :values  ["sum"]}
                                               :pivot.condense_duplicate_totals true}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]
                                                               [:avg $rating]]
                                                 :breakout    [$category
                                                               !month.created_at]})}]
        (let [result (mt/user-http-request :crowberto :post 200
                                           (format "card/%d/query/xlsx" pivot-card-id)
                                           {:format_rows   true
                                            :pivot_results true})
              pivot  (read-xlsx result)]
          (is (= [["Created At: Month" "Doohickey" "Gadget" "Gizmo" "Widget" "Row totals"]
                  ["May, 2016" "144.12" "81.58" "75.09" "90.21" "391"]
                  ["June, 2016" "82.92" "75.53" "83.26" "" "241.71"]]
                 (take 3 pivot))))

        (testing "but only when `qp.settings/enable-pivoted-exports` is true"
          (mt/with-temporary-setting-values [qp.settings/enable-pivoted-exports false]
            (let [result      (mt/user-http-request :crowberto :post 200
                                                    (format "card/%d/query/xlsx" pivot-card-id)
                                                    :format_rows   true
                                                    :pivot_results true)
                  sheet      (read-xlsx result)]
              (is (= [["Category" "Created At: Month" "Sum of Price" "Average of Rating"]
                      ["Doohickey" "May 1, 2016, 12:00 AM" "144.12" "2.97"]
                      ["Doohickey" "June 1, 2016, 12:00 AM" "82.92" "3.6"]]
                     (take 3 sheet))))))))))

(deftest ^:parallel zero-column-native-pivot-tables-test
  (testing "Pivot tables with zero columns download correctly as xlsx."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CREATED_AT" "CATEGORY"]
                                                :columns []
                                                :values  ["sum"]}}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]]
                                                 :breakout    [$category
                                                               !month.created_at]})}]
        (let [result (mt/user-http-request :crowberto :post 200
                                           (format "card/%d/query/xlsx" pivot-card-id)
                                           {:format_rows   true
                                            :pivot_results true})
              pivot (read-xlsx result)]
          (is (= [["Created At: Month" "Category" "Sum of Price"]
                  ["May, 2016" "Doohickey" "144.12"]
                  ["May, 2016" "Gadget" "81.58"]]
                 (take 3 pivot))))))))

(deftest ^:parallel zero-row-native-pivot-tables-test
  (testing "Pivot tables with zero rows download correctly as xlsx."
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    []
                                                :columns ["CATEGORY"]
                                                :values  ["sum"]}}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]]
                                                 :breakout    [$category]})}]
        (let [result       (mt/user-http-request :crowberto :post 200
                                                 (format "card/%d/query/xlsx" pivot-card-id)
                                                 {:format_rows   true
                                                  :pivot_results true})
              pivot (read-xlsx result)]
          (is (= [["Doohickey" "Gadget" "Gizmo" "Widget" "Row totals"]
                  ["2,185.89" "3,019.2" "2,834.88" "3,109.31" "11,149.28"]]
                 pivot)))))))

(deftest ^:parallel pivot-table-questions-can-export-unpivoted
  (testing "Pivot tables will export the 'classic' way by default"
    (testing "for csv"
      (mt/dataset test-data
        (mt/with-temp [:model/Card {pivot-card-id :id}
                       {:display                :pivot
                        :visualization_settings {:pivot_table.column_split
                                                 {:rows    ["CREATED_AT" "CATEGORY"]
                                                  :columns []
                                                  :values  ["sum"]}}
                        :dataset_query          (mt/mbql-query products
                                                  {:aggregation [[:sum $price]]
                                                   :breakout    [$category
                                                                 !month.created_at]})}]
          (let [result (->> (mt/user-http-request :crowberto :post 200
                                                  (format "card/%d/query/csv" pivot-card-id)
                                                  {:format_rows true})
                            csv/read-csv)]
            (is (= [["Category" "Created At: Month" "Sum of Price"]
                    ["Doohickey" "May, 2016" "144.12"]
                    ["Doohickey" "June, 2016" "82.92"]
                    ["Doohickey" "July, 2016" "78.22"]
                    ["Doohickey" "August, 2016" "71.09"]
                    ["Doohickey" "September, 2016" "45.65"]]
                   (take 6 result)))))))))

(deftest ^:parallel pivot-table-questions-can-export-unpivoted-2
  (testing "Pivot tables will export the 'classic' way by default"
    (testing "for xlsx"
      (mt/dataset test-data
        (mt/with-temp [:model/Card {pivot-card-id :id}
                       {:display                :pivot
                        :visualization_settings {:pivot_table.column_split
                                                 {:rows    []
                                                  :columns ["CATEGORY"]
                                                  :values  ["sum"]}}
                        :dataset_query          (mt/mbql-query products
                                                  {:aggregation [[:sum $price]]
                                                   :breakout    [$category]})}]
          (let [result (mt/user-http-request :crowberto :post 200 (format "card/%d/query/xlsx?format_rows=false" pivot-card-id))
                data   (with-open [in (io/input-stream result)]
                         (let [wb   (spreadsheet/load-workbook in)
                               data (->> (spreadsheet/select-sheet "Query result" wb)
                                         spreadsheet/row-seq
                                         (mapv (fn [row] (->> (spreadsheet/cell-seq row)
                                                              (mapv spreadsheet/read-cell)))))]
                           data))]
            (is (= [["Category" "Sum of Price"]
                    ["Doohickey" 2185.89]
                    ["Gadget" 3019.2]
                    ["Gizmo" 2834.88]
                    ["Widget" 3109.31]]
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
          (let [card-result     (card-download card {:export-format :csv :format-rows true})
                dashcard-result (dashcard-download dashcard {:export-format :csv :format-rows true})
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
        (mt/with-temp [:model/Card {card-id :id} {:display       :table
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
          (let [subscription-result (subscription-attachment! dashcard {:export-format :csv :format-rows true})
                subscription-header ["ID" "User ID" "Product ID" "SUB CASH MONEY" "Tax"
                                     "CASH MONEY" "Discount ($)" "Created At" "Quantity"]]
            (is (= {:subscription-attachment subscription-header}
                   {:subscription-attachment (first subscription-result)}))))))))

(deftest downloads-row-limit-test
  (testing "Downloads row limit respects minimum (#52019)"
    (mt/with-temporary-setting-values [download-row-limit 100]
      (mt/with-temp [:model/Card card {:display       :table
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:query "SELECT 1 as A FROM generate_series(1,109);"}}}]
        (let [results (all-outputs! card {:export-format :csv})]
          (is (= {:card-download            110
                  :unsaved-card-download    110
                  :alert-attachment         110
                  :dashcard-download        110
                  :subscription-attachment  110
                  :public-question-download 110
                  :public-dashcard-download 110}
                 (update-vals results count)))))))
  (testing "Downloads row limit can be raised"
    (binding [qp.settings/*minimum-download-row-limit* 100]
      (mt/with-temporary-setting-values [download-row-limit 109]
        (mt/with-temp [:model/Card card {:display       :table
                                         :dataset_query {:database (mt/id)
                                                         :type     :native
                                                         :native   {:query "SELECT 1 as A FROM generate_series(1,109);"}}}]
          (let [results (all-outputs! card {:export-format :csv})]
            (is (= {:card-download            110
                    :unsaved-card-download    110
                    :alert-attachment         110
                    :dashcard-download        110
                    :subscription-attachment  110
                    :public-question-download 110
                    :public-dashcard-download 110}
                   (update-vals results count)))))))))

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
          (let [card-result     (card-download card {:export-format :csv :format-rows true})
                dashcard-result (dashcard-download card {:export-format :csv :format-rows true})]
            (is (= {:card-download     ["Subtotal (CAD)" "0.38"]
                    :dashcard-download ["Subtotal (CAD)" "0.38"]}
                   {:card-download     (mapv #(nth % 3) (take 2 card-result))
                    :dashcard-download (mapv #(nth % 3) (take 2 dashcard-result))}))))))))

(deftest ^:parallel column-settings-on-aggregated-columns-test
  (testing "Column settings on aggregated columns are applied"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card  {:display                :table
                                        :type                   :model
                                        :dataset_query          (mt/mbql-query products
                                                                  {:aggregation [[:sum $price]]
                                                                   :breakout    [$category]
                                                                   :limit       10})
                                        :visualization_settings {:column_settings
                                                                 {"[\"name\",\"sum\"]"
                                                                  {:number_style       "currency"
                                                                   :currency           "CAD"
                                                                   :currency_style     "name"
                                                                   :currency_in_header false}}}}]
        (testing "for csv"
          (is (= "2,185.89 Canadian dollars"
                 (-> (card-download card {:export-format :csv :format-rows true}) second second))))
        (testing "for xlsx (#43039)"
          (is (= "2,185.89 Canadian dollars"
                 (-> (card-download card {:export-format :xlsx :format-rows true}) second second))))))))

(deftest ^:parallel table-metadata-affects-column-formatting-properly
  (testing "A Table's configured metadata (eg. Semantic Type of currency) can affect column formatting"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card  {:display                :table
                                        :type                   :model
                                        :dataset_query          (mt/mbql-query orders
                                                                  {:filter [:not-null $discount]
                                                                   :limit  1})
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
                 (card-download card {:export-format :csv :format-rows true}))))
        (testing "for xlsx"
          ;; the [$$] part will appear as $ when you open the Excel file in a spreadsheet app
          (is (= [["Discount"] ["[$$]6.42"]]
                 (card-download card {:export-format :xlsx :format-rows true}))))))))

(deftest clean-errors-test
  (testing "Queries that error should not include visualization settings (metabase-private #233)"
    (with-redefs [formatter/number-formatter (fn [& _args] (fn [_] (throw (Exception. "Test Exception"))))]
      (mt/with-temp [:model/Card {card-id :id} {:display                :table
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
        (let [illegal-strings ["visualization-settings" ":viz-settings" "visualization_settings"]]
          (doseq [export-format ["csv" "json" #_"xlsx"]]
            ;; for now, don't try to read xlsx back in, it will not be correct since we end up writing
            ;; a json blob to the output stream, it creates an invalid xlsx anyway.
            ;; This is not new behaviour, we'll just fix it when a better solution to 'errors in downloaded files' comes along
            (let [results (mt/user-http-request :rasta :post 200 (format "card/%d/query/%s" card-id export-format)
                                                {:format_rows true})
                  results-string (if (= "xlsx" export-format)
                                   (read-xlsx results)
                                   (str results))]
              (testing (format "Testing export format: %s" export-format)
                (doseq [illegal illegal-strings]
                  (is (not (str/blank? results-string)))
                  (is (str/includes? results-string "Test Exception"))
                  (testing (format "String \"%s\" is not in the error message." illegal)
                    (is (not (str/includes? results-string illegal)))))))))))))

(deftest unpivoted-pivot-results-do-not-include-pivot-grouping
  (testing "If a pivot question is downloaded or exported unpivoted, the results do not include 'pivot-grouping' column"
    (doseq [export-format ["csv" "xlsx" "json"]]
      (testing (format "for %s" export-format)
        (mt/dataset test-data
          (mt/with-temp [:model/Card {pivot-card-id :id}
                         {:display                :pivot
                          :visualization_settings {:pivot_table.column_split
                                                   {:rows    []
                                                    :columns ["CATEGORY"]
                                                    :values  ["sum"]}}
                          :dataset_query          (mt/mbql-query products
                                                    {:aggregation [[:sum $price]]
                                                     :breakout    [$category]})}]
            (let [result (mt/user-http-request :crowberto :post 200
                                               (format "card/%d/query/%s?format_rows=false" pivot-card-id export-format)
                                               {})
                  data   (process-results (keyword export-format) result)]
              (is (= ["Category" "Sum of Price"]
                     (first data)))
              (is (= 2
                     (count (second data)))))))))))

(deftest unpivoted-pivot-results-use-correct-formatters-in-xlsx
  (testing "If a pivot question is downloaded or exported unpivoted as XLSX, the formatters are set up properly (#48158)"
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    []
                                                :columns ["CATEGORY"]
                                                :values  ["count"]}
                                               :column_settings {"[\"name\",\"count\"]" {:number_style "percent"}}}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:count] #_[:sum [:field (mt/id :products :price) {:base-type :type/Float}]]]
                                                 :breakout    [$category]})}]
        (let [result   (mt/user-http-request :crowberto :post 200
                                             (format "card/%d/query/xlsx" pivot-card-id)
                                             {:format_rows true})
              data   (process-results :xlsx result)]
          (is (= ["Doohickey" "4,200.00%"] (second data))))))))

(deftest format-rows-value-affects-xlsx-exports
  (testing "Format-rows true/false is respected for xlsx exports."
    (mt/with-temporary-setting-values [enable-pivoted-exports true
                                       custom-formatting      {}]
      (mt/with-temp [:model/Card card
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CATEGORY"]
                                                :columns ["CREATED_AT"]
                                                :values  ["sum"]}
                                               :pivot.condense_duplicate_totals true
                                               :column_settings
                                               {"[\"name\",\"sum\"]" {:number_style       "currency"
                                                                      :currency_in_header false}}}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]]
                                                 :breakout    [$category
                                                               !year.created_at]})}]
        (is (= [["Category" "2016" "2017" "2018" "2019" "Row totals"]
                ["Doohickey" "[$$]632.14" "[$$]854.19" "[$$]496.43" "[$$]203.13" "[$$]2,185.89"]
                ["Gadget" "[$$]679.83" "[$$]1,059.11" "[$$]844.51" "[$$]435.75" "[$$]3,019.20"]]
               (take 3 (card-download card {:export-format :xlsx :format-rows true :pivot true}))))
        (is (= [["Category"
                 "January 1, 2016, 12:00 AM"
                 "January 1, 2017, 12:00 AM"
                 "January 1, 2018, 12:00 AM"
                 "January 1, 2019, 12:00 AM"
                 "Row totals"]
                ["Doohickey" "632.14" "854.19" "496.43" "203.13" "2,185.89"]
                ["Gadget" "679.83" "1,059.11" "844.51" "435.75" "3,019.2"]]
               (take 3 (card-download card {:export-format :xlsx :format-rows false :pivot true}))))))))

(deftest unformatted-downloads-and-exports-keep-numbers-as-numbers
  (testing "Unformatted numbers in downloads remain numbers."
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:display       :table
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:query "SELECT 1234.567 as A"}}}]
        (testing "CSV downloads respect the formatted/unformatted setting"
          (let [formatted-results   (all-downloads card {:export-format :csv :format-rows true})
                unformatted-results (all-downloads card {:export-format :csv :format-rows false})]
            (is (= {:unsaved-card-download    [["A"] ["1,234.57"]]
                    :card-download            [["A"] ["1,234.57"]]
                    :public-question-download [["A"] ["1,234.57"]]
                    :dashcard-download        [["A"] ["1,234.57"]]
                    :public-dashcard-download [["A"] ["1,234.57"]]}
                   formatted-results))
            (is (= {:unsaved-card-download    [["A"] ["1234.567"]]
                    :card-download            [["A"] ["1234.567"]]
                    :public-question-download [["A"] ["1234.567"]]
                    :dashcard-download        [["A"] ["1234.567"]]
                    :public-dashcard-download [["A"] ["1234.567"]]}
                   unformatted-results))))
        (testing "JSON downloads respect the formatted/unformatted setting"
          (let [formatted-results   (all-downloads card {:export-format :json :format-rows true})
                unformatted-results (all-downloads card {:export-format :json :format-rows false})]
            (is (= {:unsaved-card-download    [["A"] ["1,234.57"]]
                    :card-download            [["A"] ["1,234.57"]]
                    :public-question-download [["A"] ["1,234.57"]]
                    :dashcard-download        [["A"] ["1,234.57"]]
                    :public-dashcard-download [["A"] ["1,234.57"]]}
                   formatted-results))
            (is (= {:unsaved-card-download    [["A"] [1234.567]]
                    :card-download            [["A"] [1234.567]]
                    :public-question-download [["A"] [1234.567]]
                    :dashcard-download        [["A"] [1234.567]]
                    :public-dashcard-download [["A"] [1234.567]]}
                   unformatted-results))))))))

(deftest pivot-measures-order-test
  (testing "A pivot download will use the user-configured measures order (#48442)."
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:display                :pivot
                                       :dataset_query          (mt/mbql-query products
                                                                 {:aggregation [[:count]
                                                                                [:sum $price]
                                                                                [:avg $rating]]
                                                                  :breakout    [$category]})
                                       :visualization_settings {:pivot_table.column_split
                                                                {:rows    ["CATEGORY"]
                                                                 :columns []
                                                                 :values  ["sum" "count" "avg"]}
                                                                :column_settings
                                                                {"[\"name\",\"count\"]" {:column_title "Count Renamed"}
                                                                 "[\"name\",\"sum\"]"   {:column_title "Sum Renamed"}
                                                                 "[\"name\",\"avg\"]"   {:column_title "Average Renamed"}}}}]
        (let [expected-header   ["Category" "Sum of Price" "Count" "Average of Rating"]
              formatted-results (all-downloads card {:export-format :csv :format-rows false :pivot true})]
          (is (= {:unsaved-card-download    expected-header
                  :card-download            expected-header
                  :public-question-download expected-header
                  :dashcard-download        expected-header
                  :public-dashcard-download expected-header}
                 (update-vals formatted-results first))))
        (testing "The column title changes are used when format-rows is true"
          (let [expected-header   ["Category" "Sum Renamed" "Count Renamed" "Average Renamed"]
                formatted-results (all-downloads card {:export-format :csv :format-rows true :pivot true})]
            (is (= {:unsaved-card-download    expected-header
                    :card-download            expected-header
                    :public-question-download expected-header
                    :dashcard-download        expected-header
                    :public-dashcard-download expected-header}
                   (update-vals formatted-results first)))))))))

(deftest pivot-rows-order-test
  (testing "A pivot download will use the user-configured rows order."
    (mt/with-temporary-setting-values [enable-pivoted-exports true]
      (mt/with-temp [:model/Card card {:display                :pivot
                                       :dataset_query          (mt/mbql-query products
                                                                 {:aggregation  [[:count]]
                                                                  :breakout     [$category
                                                                                 !year.created_at]})
                                       :visualization_settings {:pivot_table.column_split
                                                                {:rows    ["CREATED_AT" "CATEGORY"]
                                                                 :columns []
                                                                 :values  ["count"]}
                                                                :column_settings
                                                                {"[\"name\",\"count\"]" {:column_title "Count Renamed"}}}}]
        (let [expected-header   ["Created At: Year" "Category" "Count"]
              formatted-results (all-downloads card {:export-format :csv :format-rows false :pivot true})]
          (is (= {:unsaved-card-download    expected-header
                  :card-download            expected-header
                  :public-question-download expected-header
                  :dashcard-download        expected-header
                  :public-dashcard-download expected-header}
                 (update-vals formatted-results first))))
        (testing "The column title changes are used when format-rows is true"
          (let [expected-header   ["Created At: Year" "Category" "Count Renamed"]
                formatted-results (all-downloads card {:export-format :csv :format-rows true :pivot true})]
            (is (= {:unsaved-card-download    expected-header
                    :card-download            expected-header
                    :public-question-download expected-header
                    :dashcard-download        expected-header
                    :public-dashcard-download expected-header}
                   (update-vals formatted-results first)))))))))

(deftest pivot-non-numeric-values-in-aggregations
  (testing "A pivot table with an aggegation that results in non-numeric values (eg. Dates) will still work (#49353)."
    (mt/dataset test-data
      (mt/with-temp [:model/Card card {:display                :pivot
                                       :dataset_query          (mt/mbql-query products
                                                                 {:aggregation [[:count]
                                                                                [:min !year.created_at]]
                                                                  :breakout    [$category
                                                                                !year.created_at]})
                                       :visualization_settings {:pivot_table.column_split
                                                                {:rows    [[:field (mt/id :products :created_at) {:base-type :type/DateTime :temporal-unit :year}]
                                                                           [:field (mt/id :products :category) {:base-type :type/Text}]]
                                                                 :columns []
                                                                 :values  [[:aggregation 0] [:aggregation 1]]}
                                                                :column_settings
                                                                {"[\"name\",\"count\"]" {:column_title "Count Renamed"}}}}]
        (let [expected-header   ["Created At: Year" "Category" "Count" "Min of Created At: Year"]
              formatted-results (all-downloads card {:export-format :csv :format-rows false :pivot true})]
          (is (= {:unsaved-card-download    expected-header
                  :card-download            expected-header
                  :public-question-download expected-header
                  :dashcard-download        expected-header
                  :public-dashcard-download expected-header}
                 (update-vals formatted-results first))))
        (testing "The column title changes are used when format-rows is true"
          (let [expected-header   ["Created At: Year" "Category" "Count Renamed" "Min of Created At: Year"]
                formatted-results (all-downloads card {:export-format :csv :format-rows true :pivot true})]
            (is (= {:unsaved-card-download    expected-header
                    :card-download            expected-header
                    :public-question-download expected-header
                    :dashcard-download        expected-header
                    :public-dashcard-download expected-header}
                   (update-vals formatted-results first)))))))))

(defn- pivot-card-with-scalar [scalar]
  {:display                :pivot
   :visualization_settings {:pivot_table.column_split
                            {:rows    ["CATEGORY"]
                             :columns ["CREATED_AT"]
                             :values  ["sum"]}
                            :pivot.condense_duplicate_totals true
                            :column_settings
                            {"[\"name\",\"sum\"]" (merge {:number_style       "currency"
                                                          :currency_in_header false}
                                                         (when scalar {:scale scalar}))}}
   :dataset_query          (mt/mbql-query products
                             {:aggregation [[:sum $price]]
                              :breakout    [$category
                                            !year.created_at]})})

(deftest pivot-with-scale-test
  (testing "Pivot table exports work with \"Multiply by a number\" (scale)"
    (mt/dataset test-data
      (mt/with-temp [:model/Card {:keys [created_at] :as no-scale-card}  (pivot-card-with-scalar nil)
                     :model/Card one-scale-card (assoc (pivot-card-with-scalar 1) :created_at created_at)
                     :model/Card zero-scale-card (assoc (pivot-card-with-scalar 0) :created_at created_at)]
        (let [named-cards {:one-scale-card one-scale-card
                           :two-scale-card zero-scale-card
                           :no-scale-card no-scale-card}]
          ;; TODO: We don't support JSON for pivot tables, once we do, we should add them here
          (doseq [[c1-name c2-name export-format expected] [[:one-scale-card  :no-scale-card  :csv  true]
                                                            [:one-scale-card  :two-scale-card :csv  false]
                                                            [:no-scale-card   :two-scale-card :csv  false]
                                                            [:one-scale-card  :no-scale-card  :xlsx true]
                                                            [:one-scale-card  :two-scale-card :xlsx false]
                                                            [:no-scale-card   :two-scale-card :xlsx false]]]
            (testing (str "> " (name c1-name) " and " (name c2-name) " with export-format: '" (name export-format) "' should be " expected)
              (let [c1 (get named-cards c1-name)
                    c2 (get named-cards c2-name)
                    [unique-to-a unique-to-b _both]
                    (data/diff (all-outputs! c1 {:export-format export-format :format-rows true :pivot true})
                               (all-outputs! c2 {:export-format export-format :format-rows true :pivot true}))]
                (if expected
                  (is (= [nil nil] [unique-to-a unique-to-b]))
                  (is (or (some? unique-to-a) (some? unique-to-b))))))))))))

(deftest ^:parallel pivot-exports-handle-nil-in-breakout-column
  (testing "Pivot Exports will still work if the breakout column contains `nil` values."
    (let [q "SELECT A,
           CASE
             WHEN A = 2 THEN NULL
             ELSE A
           END AS MEASURE
         FROM ( SELECT 1 AS A UNION ALL SELECT 2 UNION ALL SELECT 3 )"]
      (mt/dataset test-data
        (mt/with-temp [:model/Card {pivot-data-card-id :id}
                       {:dataset_query {:database (mt/id)
                                        :type     :native
                                        :native
                                        {:template-tags {}
                                         :query         q}}
                        :result_metadata
                        (into [] (for [[_ field-name {:keys [base-type]}] pivot-fields]
                                   {:name         field-name
                                    :display_name field-name
                                    :field_ref    [:field field-name {:base-type base-type}]
                                    :base_type    base-type}))}
                       :model/Card pivot-card
                       {:display                :pivot
                        :visualization_settings {:pivot_table.column_split
                                                 {:rows    ["MEASURE"]
                                                  :columns []
                                                  :values  ["count" "sum"]}
                                                 :pivot.condense_duplicate_totals true}
                        :dataset_query          (mt/mbql-query nil
                                                  {:breakout     [[:field "MEASURE" {:base-type :type/Integer}]],
                                                   :aggregation
                                                   [[:count]
                                                    [:sum [:field "A" {:base-type :type/Integer}]]]
                                                   :source-table (format "card__%s" pivot-data-card-id)})}]
          (let [result (card-download pivot-card {:export-format :csv :pivot true})]
            (is (= [["MEASURE" "Count" "Sum of A"]
                    ["" "1" "2"]
                    ["1" "1" "1"]
                    ["3" "1" "3"]
                    ["Grand totals" "3" "6"]]
                   result))))))))

(deftest ^:parallel pivot-exports-handle-aggregations-with-the-same-base-name
  (testing "Pivot Exports with multiple of the same kind of aggregation will include all of the data."
    (let [q "SELECT A, B, MEASURE
               FROM (
                  SELECT 1 as A, 1 as B, 1 as MEASURE UNION ALL
                  SELECT 2, 2, 2 UNION ALL
                  SELECT 3, 3, 3 UNION ALL
                  SELECT 4, 4, 4  UNION ALL
                  SELECT 5, 5, 5
               )"]
      (mt/dataset test-data
        (mt/with-temp [:model/Card {pivot-data-card-id :id}
                       {:dataset_query {:database (mt/id)
                                        :type     :native
                                        :native
                                        {:template-tags {}
                                         :query         q}}
                        :result_metadata
                        (into [] (for [[_ field-name {:keys [base-type]}] pivot-fields]
                                   {:name         field-name
                                    :display_name field-name
                                    :field_ref    [:field field-name {:base-type base-type}]
                                    :base_type    base-type}))}
                       :model/Card pivot-card
                       {:display                :pivot
                        :visualization_settings {:pivot_table.column_split
                                                 {:rows    ["MEASURE"]
                                                  :columns []
                                                  :values  ["count" "sum" "sum_2"]}
                                                 :pivot.condense_duplicate_totals true}
                        :dataset_query          (mt/mbql-query nil
                                                  {:breakout [[:field "MEASURE" {:base-type :type/Integer}]],
                                                   :aggregation
                                                   [[:count]
                                                    [:sum [:field "A" {:base-type :type/Integer}]]
                                                    [:sum [:field "B" {:base-type :type/Integer}]]]
                                                   :source-table (format "card__%s" pivot-data-card-id)})}
                       :model/Card reordered-card
                       {:display                :pivot
                        :visualization_settings {:pivot_table.column_split
                                                 {:rows    ["MEASURE"]
                                                  :columns []
                                                  :values  ["sum_2" "count" "sum"]}
                                                 :pivot.condense_duplicate_totals true}
                        :dataset_query          (mt/mbql-query nil
                                                  {:breakout     [[:field "MEASURE" {:base-type :type/Integer}]],
                                                   :aggregation
                                                   [[:count]
                                                    [:sum [:field "A" {:base-type :type/Integer}]]
                                                    [:sum [:field "B" {:base-type :type/Integer}]]]
                                                   :source-table (format "card__%s" pivot-data-card-id)})}]
          (let [result (card-download pivot-card {:export-format :csv :pivot true})
                reordered-result (card-download reordered-card {:export-format :csv :pivot true})]
            (testing "Both Sums are correctly included."
              (is (= [["MEASURE" "Count" "Sum of A" "Sum of B"]
                      ["1" "1" "1" "1"]
                      ["2" "1" "2" "2"]
                      ["3" "1" "3" "3"]
                      ["4" "1" "4" "4"]
                      ["5" "1" "5" "5"]
                      ["Grand totals" "5" "15" "15"]]
                     result)))
            (testing "and different order still works."
              (is (= [["MEASURE" "Sum of B" "Count" "Sum of A"]
                      ["1" "1" "1" "1"]
                      ["2" "2" "1" "2"]
                      ["3" "3" "1" "3"]
                      ["4" "4" "1" "4"]
                      ["5" "5" "1" "5"]
                      ["Grand totals" "15" "5" "15"]]
                     reordered-result)))))))))

(deftest ^:parallel pivot-exports-aggregations-work
  (testing "Pivot Exports have correct aggregations."
    (let [q "SELECT A, B
               FROM (
                  SELECT 1 as A, 1 as B UNION ALL
                  SELECT 1, 2 UNION ALL
                  SELECT 1, 3 UNION ALL
                  SELECT 1, 4 UNION ALL
                  SELECT 1, 5 UNION ALL
                  SELECT 2, 10 UNION ALL
                  SELECT 2, 20 UNION ALL
                  SELECT 2, 30 UNION ALL
                  SELECT 2, 40 UNION ALL
                  SELECT 2, 50 UNION ALL
                  SELECT 3, -1 UNION ALL
                  SELECT 3, -2 UNION ALL
                  SELECT 3, -3 UNION ALL
                  SELECT 3, -4 UNION ALL
                  SELECT 3, -5 UNION ALL
                  SELECT 4, 15 UNION ALL
                  SELECT 4, 25 UNION ALL
                  SELECT 4, 35 UNION ALL
                  SELECT 4, 45 UNION ALL
                  SELECT 4, 55 UNION ALL
                  SELECT 5, 11 UNION ALL
                  SELECT 5, 22 UNION ALL
                  SELECT 5, 33 UNION ALL
                  SELECT 5, 44 UNION ALL
                  SELECT 5, 55
               )"]
      (mt/dataset test-data
        (mt/with-temp [:model/Card {pivot-data-card-id :id}
                       {:dataset_query {:database (mt/id)
                                        :type     :native
                                        :native
                                        {:template-tags {}
                                         :query         q}}
                        :result_metadata
                        (into [] (for [[_ field-name {:keys [base-type]}] pivot-fields]
                                   {:name         field-name
                                    :display_name field-name
                                    :field_ref    [:field field-name {:base-type base-type}]
                                    :base_type    base-type}))}
                       :model/Card pivot-card
                       {:display                :pivot
                        :visualization_settings {:pivot_table.column_split
                                                 {:rows    ["A"]
                                                  :columns []
                                                  :values  ["count" "sum" "avg" "min" "max"]}
                                                 :pivot.condense_duplicate_totals true}
                        :dataset_query          (mt/mbql-query nil
                                                  {:breakout     [[:field "A" {:base-type :type/Integer}]],
                                                   :aggregation
                                                   [[:count]
                                                    [:sum [:field "B" {:base-type :type/Integer}]]
                                                    [:avg [:field "B" {:base-type :type/Integer}]]
                                                    [:min [:field "B" {:base-type :type/Integer}]]
                                                    [:max [:field "B" {:base-type :type/Integer}]]]
                                                   :source-table (format "card__%s" pivot-data-card-id)})}]
          (let [result (card-download pivot-card {:export-format :csv :pivot true})]
            (is (= [["A" "Count" "Sum of B" "Average of B" "Min of B" "Max of B"]
                    ["1" "5" "15" "3.0" "1" "5"]
                    ["2" "5" "150" "30.0" "10" "50"]
                    ["3" "5" "-15" "-3.0" "-5" "-1"]
                    ["4" "5" "175" "35.0" "15" "55"]
                    ["5" "5" "165" "33.0" "11" "55"]
                    ["Grand totals" "25" "490" "19.6" "-5" "55"]]
                   result))))))))

(deftest table-exports-with-non-integral-scale
  (testing "Non integral scale values should be respected in table exports (csv, xlsx, json)"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card-scaled  {:display                :table
                                               :type                   :model
                                               :dataset_query          {:database (mt/id)
                                                                        :type     :query
                                                                        :query    {:source-table (mt/id :orders)
                                                                                   :limit        1}}
                                               :visualization_settings {:table.columns
                                                                        [{:name "ID" :enabled false}
                                                                         {:name "USER_ID" :enabled false}
                                                                         {:name "PRODUCT_ID" :enabled false}
                                                                         {:name "SUBTOTAL" :enabled false}
                                                                         {:name "TAX" :enabled false}
                                                                         {:name "TOTAL" :enabled false}
                                                                         {:name "DISCOUNT" :enabled false}
                                                                         {:name "CREATED_AT" :enabled false}
                                                                         {:name "QUANTITY" :enabled true}]
                                                                        :table.cell_column "SUBTOTAL"
                                                                        :column_settings   {(format "[\"ref\",[\"field\",%s,null]]" (mt/id :orders :discount))
                                                                                            {:currency_in_header false}
                                                                                            "[\"name\",\"QUANTITY\"]"
                                                                                            {:scale 2.13}}}}
                     :model/Card card-unscaled  {:display                :table
                                                 :type                   :model
                                                 :dataset_query          {:database (mt/id)
                                                                          :type     :query
                                                                          :query    {:source-table (mt/id :orders)
                                                                                     :limit        1}}
                                                 :visualization_settings {:table.columns
                                                                          [{:name "ID" :enabled false}
                                                                           {:name "USER_ID" :enabled false}
                                                                           {:name "PRODUCT_ID" :enabled false}
                                                                           {:name "SUBTOTAL" :enabled false}
                                                                           {:name "TAX" :enabled false}
                                                                           {:name "TOTAL" :enabled false}
                                                                           {:name "DISCOUNT" :enabled false}
                                                                           {:name "CREATED_AT" :enabled false}
                                                                           {:name "QUANTITY" :enabled true}]
                                                                          :table.cell_column "SUBTOTAL"
                                                                          :column_settings   {(format "[\"ref\",[\"field\",%s,null]]" (mt/id :orders :discount))
                                                                                              {:currency_in_header false}}}}]
        (testing "for csv"
          (let [result-scaled (card-download card-scaled {:export-format :csv :format-rows true})
                result-unscaled (card-download card-unscaled {:export-format :csv :format-rows true})
                val-scaled (Double/parseDouble (first (second result-scaled)))
                val-unscaled (Double/parseDouble (first (second result-unscaled)))]
            (is (= val-scaled
                   (* val-unscaled 2.13)))))

        (testing "for json"
          (let [result-scaled (card-download card-scaled {:export-format :json :format-rows true})
                result-unscaled (card-download card-unscaled {:export-format :json :format-rows true})
                val-scaled (Double/parseDouble (first (second result-scaled)))
                val-unscaled (Double/parseDouble (first (second result-unscaled)))]
            (is (= val-scaled
                   (* val-unscaled 2.13)))))))))

(deftest ^:parallel pivot-xlsx-export-respects-custom-title
  (testing "Pivot tables exported as xlsx should respect column title viz settings #51342"
    (mt/dataset test-data
      (mt/with-temp [:model/Card card
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CATEGORY"]
                                                :columns []
                                                :values  ["sum" "count"]}
                                               :column_settings
                                               {"[\"name\",\"sum\"]" {:column_title "Custom Title"}}}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]
                                                               [:count]]
                                                 :breakout    [$category]})}]
        (let [res (card-download card {:export-format :xlsx :format-rows true :pivot true})]
          (is (= "Custom Title"
                 (second (first res)))))))))

(deftest pivot-subtotal-formatting-in-xlsx-test
  (testing "Pivot table subtotals in XLSX exports use formatted values as strings rather than XLSX formatting codes (#57442)"
    (mt/dataset test-data
      (mt/with-temp [:model/Card {pivot-card-id :id}
                     {:display                :pivot
                      :visualization_settings {:pivot_table.column_split
                                               {:rows    ["CREATED_AT", "CATEGORY"]
                                                :columns []
                                                :values  ["sum"]}
                                               :column_settings
                                               {"[\"name\",\"sum\"]" {:number_style "currency"
                                                                      :currency_in_header false}}
                                               :pivot.show_row_totals true}
                      :dataset_query          (mt/mbql-query products
                                                {:aggregation [[:sum $price]]
                                                 :breakout    [$category !year.created_at]})}]
        (let [result       (mt/user-http-request :crowberto :post 200
                                                 (format "card/%d/query/xlsx" pivot-card-id)
                                                 {:format_rows   true
                                                  :pivot_results true})
              pivot        (read-xlsx result)
              subtotal-row (first (filter #(str/starts-with? (first %) "Totals for") pivot))]
          (is (= "Totals for 2016" (first subtotal-row))))))))

(deftest ^:parallel pivot-condense-duplicate-totals-csv-test
  (testing "`pivot.condense_duplicate_totals` affects CSV output as expected"
    (let [viz-settings (fn [condense?]
                         {:pivot_table.column_split {:rows ["CATEGORY"]
                                                     :columns ["CREATED_AT"]
                                                     :values ["count"]}
                          :column_settings
                          {"[\"name\",\"sum\"]" {:number_style "currency"}
                           "[\"name\",\"avg\"]" {:number_style "decimal"}}
                          ;; Optionally include the condense setting
                          :pivot.condense_duplicate_totals condense?})
          expected-condensed
          [["Category" "2016" "2017" "2018" "2019" "Row totals"]
           ["Doohickey" "13" "17" "8" "4" "42"]
           ["Gadget"    "13" "19" "14" "7" "53"]
           ["Gizmo"     "9"  "21" ""  ""  "51"]
           ["Grand totals" "54" "75" "53" "18" "200"]]

          expected-uncondensed
          [["Category" "2016" "2017" "2018" "2019" "Row totals"]
           ["Doohickey" "13" "17" "8" "4" "42"]
           ["Totals for Doohickey" "13" "17" "8" "4" "42"]
           ["Gadget" "13" "19" "14" "7" "53"]
           ["Totals for Gadget" "13" "19" "14" "7" "53"]
           ["Gizmo" "9" "21" "" "" "51"]
           ["Totals for Gizmo" "9" "21" "" "" "51"]
           ["Grand totals" "54" "75" "53" "18" "200"]]]
      (mt/dataset test-data
        (doseq [[condense? expected]
                [[true expected-condensed]
                 [false expected-uncondensed]
                 [nil expected-condensed]]]
          (mt/with-temp [:model/Card card
                         {:display :pivot
                          :visualization_settings (cond-> (viz-settings condense?)
                                                    (nil? condense?) (dissoc :pivot.condense_duplicate_totals))
                          :dataset_query (mt/mbql-query products
                                           {:aggregation [[:count]]
                                            :breakout [$category !year.created_at]
                                            :limit 10})}]
            (let [result (card-download card {:export-format :csv :format-rows true :pivot true})]
              (is (= expected (take (count expected) result))
                  (str "Failed for condense_duplicate_totals=" condense?)))))))))
