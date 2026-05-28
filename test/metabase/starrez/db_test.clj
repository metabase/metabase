(ns metabase.starrez.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.starrez.db :as starrez.db]))

(deftest create-active-report-table-refreshes-stable-table-for-single-report
  (let [loaded (atom [])]
    (with-redefs [metabase.starrez.db/create-and-load-table!
                  (fn [_conn table-name csv-rows]
                    (swap! loaded conj [table-name csv-rows])
                    {:table table-name})]
      (let [csv-rows [["student"] ["A"]]]
        (is (= [{:table "active_report"}]
               (#'starrez.db/create-active-report-table!
                nil
                [{:blob-name "starrez_report_59906_2026-05-28_12-07-38.csv"
                  :csv-rows csv-rows}])))
        (is (= [["active_report" csv-rows]]
               @loaded))))))

(deftest create-active-report-table-ignores-ambiguous-snapshots
  (let [loaded (atom [])]
    (with-redefs [metabase.starrez.db/create-and-load-table!
                  (fn [_conn table-name csv-rows]
                    (swap! loaded conj [table-name csv-rows])
                    {:table table-name})]
      (is (nil?
           (#'starrez.db/create-active-report-table!
            nil
            [{:blob-name "starrez_report_59906_2026-05-28_12-07-38.csv"
              :csv-rows [["student"] ["A"]]}
             {:blob-name "starrez_report_62751_2026-05-28_12-08-38.csv"
              :csv-rows [["student"] ["B"]]}])))
      (is (= [] @loaded)))))
