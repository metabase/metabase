(ns metabase.starrez.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.starrez.db :as starrez.db]))

(deftest load-snapshot-tables-loads-single-report-into-preview-only
  (let [loaded (atom [])]
    (with-redefs [metabase.starrez.db/create-and-load-table!
                  (fn [_conn table-name csv-rows]
                    (swap! loaded conj [table-name csv-rows])
                    {:table table-name})]
      (let [csv-rows [["student"] ["A"]]]
        (is (= [{:table "active_report"}]
               (#'starrez.db/load-snapshot-tables!
                nil
                [{:blob-name "starrez_report_59906_2026-05-28_12-07-38.csv"
                  :table-name "59906"
                  :csv-rows csv-rows}])))
        (is (= [["active_report" csv-rows]]
               @loaded))))))

(deftest load-snapshot-tables-keeps-non-report-tables-named
  (let [loaded (atom [])]
    (with-redefs [metabase.starrez.db/create-and-load-table!
                  (fn [_conn table-name csv-rows]
                    (swap! loaded conj [table-name csv-rows])
                    {:table table-name})]
      (let [csv-rows [["student"] ["A"]]]
        (is (= [{:table "Entry"}]
               (#'starrez.db/load-snapshot-tables!
                nil
                [{:blob-name "starrez_Entry_2026-05-28_12-07-38.csv"
                  :table-name "Entry"
                  :csv-rows csv-rows}])))
        (is (= [["Entry" csv-rows]]
               @loaded))))))

(deftest load-snapshot-tables-keeps-report-preview-separate-from-named-tables
  (let [loaded (atom [])]
    (with-redefs [metabase.starrez.db/create-and-load-table!
                  (fn [_conn table-name _csv-rows]
                    (swap! loaded conj table-name)
                    {:table table-name})]
      (is (= [{:table "Entry"}
              {:table "active_report"}]
             (#'starrez.db/load-snapshot-tables!
              nil
              [{:blob-name "starrez_Entry_2026-05-28_12-07-33.csv"
                :table-name "Entry"
                :csv-rows [["entry_id"] ["1"]]}
               {:blob-name "starrez_report_59906_2026-05-28_12-07-38.csv"
                :table-name "59906"
                :csv-rows [["booking_id"] ["123"]]}])))
      (is (= ["Entry" "active_report"] @loaded)))))

(deftest load-snapshot-tables-refuses-legacy-multi-report-snapshots
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"multiple reports"
       (#'starrez.db/load-snapshot-tables!
        nil
        [{:blob-name "starrez_report_59906_2026-05-28_12-07-38.csv"
          :table-name "59906"
          :csv-rows [["booking_id"] ["123"]]}
         {:blob-name "starrez_report_62751_2026-05-28_12-08-38.csv"
          :table-name "62751"
          :csv-rows [["booking_id"] ["456"]]}]))))

(deftest report-ids-for-export-keeps-historical-reports-in-first-seen-order
  (with-redefs [starrez.db/list-weeks
                (constantly
                 [{:blob_files {(keyword "62751") "starrez_report_62751_2026-05-28_12-08-38.csv"}}
                  {:blob_files {(keyword "59906") "starrez_report_59906_2026-05-28_12-07-38.csv"}}])]
    (is (= ["59906" "62751" "70000"]
           (starrez.db/report-ids-for-export ["62751" "70000"])))))

(deftest prepare-report-csv-validates-and-normalizes-booking-id
  (is (= {:columns ["booking_id" "room"]
          :rows    [["123" "A"]]}
         (#'starrez.db/prepare-report-csv
          [["Booking ID" "Room"]
           [" 123 " "A"]])))
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"blank booking_id"
       (#'starrez.db/prepare-report-csv
        [["Booking ID"] [""]])))
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"duplicate booking_id"
       (#'starrez.db/prepare-report-csv
        [["Booking ID"] ["123"] ["123"]])))
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"missing required booking_id"
       (#'starrez.db/prepare-report-csv
        [["Entry ID"] ["123"]]))))

(deftest merge-report-exports-applies-newer-reports-last
  (let [merged (atom [])]
    (with-redefs [metabase.starrez.db/merge-report-csv!
                  (fn [destination-table report-id _csv-body]
                    (swap! merged conj [destination-table report-id])
                    {:report_id report-id})
                  metabase.starrez.db/sync-metabase-schema!
                  (constantly {:synced true})]
      (is (= {:destination_table "starrez_data.table_59906"
              :reports           [{:report_id "59906"}
                                  {:report_id "62751"}]
              :metadata_sync     {:synced true}}
             (starrez.db/merge-report-exports!
              ["59906" "62751"]
              [{:name "62751" :success true :csv_body "newer"}
               {:name "59906" :success true :csv_body "older"}])))
      (is (= [["table_59906" "59906"]
              ["table_59906" "62751"]]
             @merged)))))

(deftest merge-report-exports-keeps-going-after-a-failed-report
  (let [merged (atom [])]
    (with-redefs [metabase.starrez.db/merge-report-csv!
                  (fn [_destination-table report-id _csv-body]
                    (swap! merged conj report-id)
                    {:report_id report-id})
                  metabase.starrez.db/sync-metabase-schema!
                  (constantly {:synced true})]
      (is (= {:destination_table "starrez_data.table_59906"
              :reports           [{:report_id         "59906"
                                   :destination_table "starrez_data.table_59906"
                                   :error             "StarRez unavailable"}
                                  {:report_id "62751"}]
              :metadata_sync     {:synced true}}
             (starrez.db/merge-report-exports!
              ["59906" "62751"]
              [{:name "59906" :success false :error "StarRez unavailable"}
               {:name "62751" :success true :csv_body "newer"}])))
      (is (= ["62751"] @merged)))))

(deftest merge-staging-table-updates-matches-and-inserts-only-new-bookings
  (let [queries (atom [])]
    (with-redefs [metabase.starrez.db/query-count
                  (fn [_conn [sql]]
                    (swap! queries conj sql)
                    (count @queries))]
      (is (= {:updated 1
              :inserted 2}
             (#'starrez.db/merge-staging-table!
              nil
              "table_59906"
              "\"staging\""
              ["booking_id" "room"])))
      (is (re-find #"UPDATE \"starrez_data\"\.\"table_59906\" destination" (first @queries)))
      (is (re-find #"destination\.\"booking_id\" = staging\.\"booking_id\"" (first @queries)))
      (is (re-find #"WHERE NOT EXISTS" (second @queries)))
      (is (re-find #"destination\.\"booking_id\" = staging\.\"booking_id\"" (second @queries))))))

(deftest ensure-booking-id-index-creates-a-unique-index
  (let [queries (atom [])]
    (with-redefs [next.jdbc/execute!
                  (fn [_conn [sql]]
                    (swap! queries conj sql))]
      (#'starrez.db/ensure-booking-id-index! nil "table_59906")
      (is (= ["CREATE UNIQUE INDEX IF NOT EXISTS \"starrez_data\".\"table_59906_booking_id_uniq\" ON \"starrez_data\".\"table_59906\" (\"booking_id\")"]
             @queries)))))

(deftest sync-metabase-schema-syncs-matched-database
  (let [synced (atom [])]
    (with-redefs [metabase.starrez.db/starrez-metabase-database
                  (constantly {:id 2 :name "StarRez"})
                  metabase.sync.sync-metadata/sync-db-metadata!
                  (fn [database]
                    (swap! synced conj database)
                    {:ok true})]
      (is (= {:database_id 2
              :synced true}
             (#'starrez.db/sync-metabase-schema!)))
      (is (= [{:id 2 :name "StarRez"}] @synced)))))

(deftest refresh-snapshots-refreshes-list-and-schema
  (with-redefs [starrez.db/list-weeks-result
                (constantly {:weeks [{:id 7}]})
                metabase.starrez.db/sync-metabase-schema!
                (constantly {:database_id 2
                             :synced true})]
    (is (= {:weeks [{:id 7}]
            :metadata_sync {:database_id 2
                            :synced true}}
           (starrez.db/refresh-snapshots!)))))

(deftest refresh-snapshots-keeps-list-when-schema-sync-fails
  (with-redefs [starrez.db/list-weeks-result
                (constantly {:weeks [{:id 7}]})
                metabase.starrez.db/sync-metabase-schema!
                (constantly {:synced false
                             :error "No matching Metabase database found"})]
    (is (= {:weeks [{:id 7}]
            :metadata_sync {:synced false
                            :error "No matching Metabase database found"}}
           (starrez.db/refresh-snapshots!)))))
