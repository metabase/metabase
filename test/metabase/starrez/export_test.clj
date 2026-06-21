(ns metabase.starrez.export-test
  (:require
   [clojure.test :refer :all]
   [metabase.starrez.db :as starrez.db]
   [metabase.starrez.export :as starrez.export]))

(deftest record-export-snapshots-keeps-reports-separate
  (let [recorded (atom [])]
    (with-redefs [starrez.db/record-export-week!
                  (fn [blob-files]
                    (swap! recorded conj blob-files)
                    (count @recorded))]
      (is (= [1 2 3]
             (#'starrez.export/record-export-snapshots!
              [{:kind :table
                :name "Entry"
                :blob_name "starrez_Entry_2026-05-28_12-07-33.csv"
                :success true}
               {:kind :report
                :name "59906"
                :blob_name "starrez_report_59906_2026-05-28_12-07-38.csv"
                :success true}
               {:kind :report
                :name "62751"
                :blob_name "starrez_report_62751_2026-05-28_12-08-38.csv"
                :success true}])))
      (is (= [{"Entry" "starrez_Entry_2026-05-28_12-07-33.csv"}
              {"59906" "starrez_report_59906_2026-05-28_12-07-38.csv"}
              {"62751" "starrez_report_62751_2026-05-28_12-08-38.csv"}]
             @recorded)))))

(deftest run-export-uses-configured-reports-by-default
  (let [requested-report-ids (atom [])
        merged              (atom nil)]
    (with-redefs [metabase.starrez.settings/starrez-export-tables
                  (constantly "")
                  metabase.starrez.settings/starrez-export-reports
                  (constantly "62751")
                  starrez.db/report-ids-for-export
                  (fn [_configured-report-ids]
                    (throw (ex-info "manual exports should not pull historical reports" {})))
                  starrez.export/export-report
                  (fn [report-id]
                    (swap! requested-report-ids conj report-id)
                    {:kind      :report
                     :name      report-id
                     :blob_name (str "starrez_report_" report-id "_2026-05-28_12-07-38.csv")
                     :csv_body  "Booking ID,Room\n123,A\n"
                     :success   true})
                  starrez.db/record-export-week!
                  (constantly 42)
                  starrez.db/merge-report-exports!
                  (fn [report-ids results]
                    (reset! merged {:report-ids report-ids :results results})
                    {:destination_table "starrez_data.table_62751"})]
      (is (= {:results
              [{:kind      :report
                :name      "62751"
                :blob_name "starrez_report_62751_2026-05-28_12-07-38.csv"
                :success   true}]
              :snapshots [42]
              :merge     {:destination_table "starrez_data.table_62751"}}
             (starrez.export/run-export)))
      (is (= ["62751"] @requested-report-ids))
      (is (= ["62751"] (:report-ids @merged)))
      (is (every? :csv_body (:results @merged))))))

(deftest run-export-uses-manual-report-overrides
  (let [requested-report-ids (atom [])
        merged              (atom nil)]
    (with-redefs [metabase.starrez.settings/starrez-export-tables
                  (constantly "")
                  metabase.starrez.settings/starrez-export-reports
                  (constantly "last-saved-report")
                  starrez.db/report-ids-for-export
                  (fn [_configured-report-ids]
                    (throw (ex-info "manual exports should not pull historical reports" {})))
                  starrez.export/export-report
                  (fn [report-id]
                    (swap! requested-report-ids conj report-id)
                    {:kind      :report
                     :name      report-id
                     :blob_name (str "starrez_report_" report-id "_2026-05-28_12-07-38.csv")
                     :csv_body  "Booking ID,Room\n123,A\n"
                     :success   true})
                  starrez.db/record-export-week!
                  (constantly 42)
                  starrez.db/merge-report-exports!
                  (fn [report-ids results]
                    (reset! merged {:report-ids report-ids :results results})
                    {:destination_table "starrez_data.table_62751"})]
      (is (= {:results
              [{:kind      :report
                :name      "62751"
                :blob_name "starrez_report_62751_2026-05-28_12-07-38.csv"
                :success   true}]
              :snapshots [42]
              :merge     {:destination_table "starrez_data.table_62751"}}
             (starrez.export/run-export {:export-reports "62751"})))
      (is (= ["62751"] @requested-report-ids))
      (is (= ["62751"] (:report-ids @merged))))))

(deftest run-export-respects-blank-manual-report-overrides
  (with-redefs [metabase.starrez.settings/starrez-export-tables
                (constantly "")
                metabase.starrez.settings/starrez-export-reports
                (constantly "last-saved-report")
                starrez.export/export-report
                (fn [report-id]
                  (throw (ex-info "blank manual reports should not export saved reports"
                                  {:report-id report-id})))
                starrez.db/record-export-week!
                (fn [_blob-files]
                  (throw (ex-info "empty manual exports should not record snapshots" {})))
                starrez.db/merge-report-exports!
                (fn [_report-ids _results]
                  (throw (ex-info "empty manual exports should not merge reports" {})))]
    (is (= {:results [] :snapshots [] :merge nil}
           (starrez.export/run-export {:export-reports ""})))))

(deftest run-export-respects-blank-manual-table-overrides
  (with-redefs [metabase.starrez.settings/starrez-export-tables
                (constantly "Entry")
                metabase.starrez.settings/starrez-export-reports
                (constantly "")
                starrez.export/export-table
                (fn [table]
                  (throw (ex-info "blank manual tables should not export saved tables"
                                  {:table table})))
                starrez.db/record-export-week!
                (fn [_blob-files]
                  (throw (ex-info "empty manual exports should not record snapshots" {})))]
    (is (= {:results [] :snapshots [] :merge nil}
           (starrez.export/run-export {:export-tables ""})))))

(deftest run-export-can-refresh-historical-reports-for-cron
  (let [requested-report-ids (atom [])
        merged              (atom nil)]
    (with-redefs [metabase.starrez.settings/starrez-export-tables
                  (constantly "")
                  metabase.starrez.settings/starrez-export-reports
                  (constantly "62751")
                  starrez.db/report-ids-for-export
                  (fn [configured-report-ids]
                    (is (= ["62751"] configured-report-ids))
                    ["59906" "62751"])
                  starrez.export/export-report
                  (fn [report-id]
                    (swap! requested-report-ids conj report-id)
                    {:kind      :report
                     :name      report-id
                     :blob_name (str "starrez_report_" report-id "_2026-05-28_12-07-38.csv")
                     :csv_body  "Booking ID,Room\n123,A\n"
                     :success   true})
                  starrez.db/record-export-week!
                  (constantly 42)
                  starrez.db/merge-report-exports!
                  (fn [report-ids results]
                    (reset! merged {:report-ids report-ids :results results})
                    {:destination_table "starrez_data.table_59906"})]
      (is (= {:results
              [{:kind      :report
                :name      "59906"
                :blob_name "starrez_report_59906_2026-05-28_12-07-38.csv"
                :success   true}
               {:kind      :report
                :name      "62751"
                :blob_name "starrez_report_62751_2026-05-28_12-07-38.csv"
                :success   true}]
              :snapshots [42 42]
              :merge     {:destination_table "starrez_data.table_59906"}}
             (starrez.export/run-export {:include-historical-reports? true})))
      (is (= ["59906" "62751"] @requested-report-ids))
      (is (= ["59906" "62751"] (:report-ids @merged)))
      (is (every? :csv_body (:results @merged))))))
