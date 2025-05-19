(ns ^:mb/driver-tests metabase.warehouse-schema.metadata-from-qp-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.warehouse-schema.metadata-from-qp :as warehouse-schema.metadata-from-qp]
   [toucan2.core :as t2]))

;;; whether to run `field-count` and `field-distinct-count` tests.
(defmethod driver/database-supports? [::driver/driver ::field-count-tests]
  [_driver _feature _database]
  true)

;;; Redshift tests are randomly failing -- see https://github.com/metabase/metabase/issues/2767
(defmethod driver/database-supports? [:redshift ::field-count-tests]
  [_driver _feature _database]
  false)

(deftest ^:parallel field-distinct-count-test
  (mt/test-drivers (mt/normal-drivers-with-feature ::field-count-tests)
    (is (= 100
           (warehouse-schema.metadata-from-qp/field-distinct-count (t2/select-one :model/Field :id (mt/id :checkins :venue_id)))))))

(deftest ^:parallel field-distinct-count-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature ::field-count-tests)
    (is (= 15
           (warehouse-schema.metadata-from-qp/field-distinct-count (t2/select-one :model/Field :id (mt/id :checkins :user_id)))))))

(deftest ^:parallel field-count-test
  (mt/test-drivers (mt/normal-drivers-with-feature ::field-count-tests)
    (is (= 1000
           (warehouse-schema.metadata-from-qp/field-count (t2/select-one :model/Field :id (mt/id :checkins :venue_id)))))))
