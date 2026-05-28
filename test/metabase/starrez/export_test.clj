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

(deftest activate-single-snapshot-does-not-combine-multiple-snapshots
  (let [activated (atom [])]
    (with-redefs [starrez.db/activate-week!
                  (fn [snapshot-id _download-csv]
                    (swap! activated conj snapshot-id)
                    {:snapshot snapshot-id})]
      (is (= {:snapshot 42}
             (#'starrez.export/activate-single-snapshot [42])))
      (is (= [42] @activated))

      (is (= {:error "Multiple snapshots were exported; activate the required snapshot manually."}
             (#'starrez.export/activate-single-snapshot [42 43])))
      (is (= [42] @activated)))))
