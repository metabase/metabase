(ns metabase-enterprise.data-studio.seeds-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-studio.seeds :as seeds]
   [metabase.collections.test-utils :refer [with-library]]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.test :as mt]
   [metabase.upload.impl-test :as upload-test]
   [toucan2.core :as t2]))

(defn- csv-file ^java.io.File [rows]
  (upload-test/csv-file-with rows))

(deftest seed-lifecycle-test
  (mt/test-driver :h2
    (upload-test/with-uploads-enabled!
      (mt/with-current-user (mt/user->id :crowberto)
        (with-library [_]
          (let [seed (seeds/create-seed! {:seed-name "time_spine"
                                          :filename  "time_spine.csv"
                                          :file      (csv-file ["date_day,is_holiday" "2026-01-01,true" "2026-01-02,false"])})]
            (testing "create materializes a plain table with the stable name"
              (is (some? (:table_id seed)))
              (let [table (t2/select-one :model/Table :id (:table_id seed))]
                (is (= (ddl.i/format-name driver/*driver* "time_spine") (:name table)))
                (is (= :seed (:data_source table)))
                (is (:is_published table))
                (is (nil? (t2/select-one :model/Card :table_id (:id table)))
                    "no wrapping model card")))
            (testing "csv is stored as source of truth"
              (is (= {:name "time_spine"}
                     (dissoc (seeds/seed-csv (:id seed)) :csv))
                  (is (re-find #"date_day" (:csv (seeds/seed-csv (:id seed)))))))
            (testing "duplicate name is rejected"
              (is (thrown-with-msg? Exception #"already"
                                    (seeds/create-seed! {:seed-name "time_spine"
                                                         :filename  "x.csv"
                                                         :file      (csv-file ["a" "1"])}))))
            (testing "replace is full-refresh"
              (let [seed' (seeds/replace-seed! (:id seed) "time_spine.csv"
                                               (csv-file ["date_day,fiscal_quarter" "2026-01-01,Q1"]))]
                (is (= (:table_id seed) (:table_id seed')) "same table row")
                (is (not= (:csv_hash seed) (:csv_hash seed')))))
            (testing "delete drops table and row"
              (seeds/delete-seed! (:id seed))
              (is (nil? (t2/select-one :model/Seed :id (:id seed))))
              (is (false? (t2/select-one-fn :active :model/Table :id (:table_id seed)))))))))))

(deftest create-seed-validates-name-test
  (mt/test-driver :h2
    (upload-test/with-uploads-enabled!
      (mt/with-current-user (mt/user->id :crowberto)
        (doseq [bad-name ["Time Spine" "1st" "UPPER" "dash-ed" ""]]
          (is (thrown-with-msg? Exception #"lowercase"
                                (seeds/create-seed! {:seed-name bad-name
                                                     :filename  "x.csv"
                                                     :file      (csv-file ["a" "1"])}))
              bad-name))))))
