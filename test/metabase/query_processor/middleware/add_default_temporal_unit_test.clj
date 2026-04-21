(ns metabase.query-processor.middleware.add-default-temporal-unit-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.add-default-temporal-unit :as qp.add-default-temporal-unit]))

(driver/register! ::test-driver, :abstract? true)

(defmethod driver/database-supports? [::test-driver :temporal/requires-default-unit]
  [_driver _database _feature]
  true)

(deftest ^:parallel basic-test
  (driver/with-driver ::test-driver
    (is (=? {:stages [{:fields [[:field {:temporal-unit :default} pos-int?]]}]}
            (-> (lib.tu.macros/mbql-5-query checkins
                  {:stages [{:fields [[:field {} %date]]}]})
                qp.add-default-temporal-unit/add-default-temporal-unit)))))
