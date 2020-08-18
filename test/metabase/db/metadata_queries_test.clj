(ns metabase.db.metadata-queries-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Field Table]]
             [test :as mt]]
            [metabase.db.metadata-queries :as metadata-queries]))

;; Redshift tests are randomly failing -- see https://github.com/metabase/metabase/issues/2767
(defn- metadata-queries-test-drivers []
  (mt/normal-drivers-except #{:redshift}))

(deftest field-distinct-count-test
  (mt/test-drivers (metadata-queries-test-drivers)
    (is (= 100
           (metadata-queries/field-distinct-count (Field (mt/id :checkins :venue_id)))))

    (is (= 15
           (metadata-queries/field-distinct-count (Field (mt/id :checkins :user_id)))))))

(deftest field-count-test
  (mt/test-drivers (metadata-queries-test-drivers)
    (is (= 1000
           (metadata-queries/field-count (Field (mt/id :checkins :venue_id)))))))

(deftest table-row-count-test
  (mt/test-drivers (metadata-queries-test-drivers)
    (is (= 1000
           (metadata-queries/table-row-count (Table (mt/id :checkins)))))))

(deftest field-distinct-values-test
  (mt/test-drivers (metadata-queries-test-drivers)
    (is (= [1 2 3 4 5 6 7 8 9 10 11 12 13 14 15]
           (map int (metadata-queries/field-distinct-values (Field (mt/id :checkins :user_id))))))))
