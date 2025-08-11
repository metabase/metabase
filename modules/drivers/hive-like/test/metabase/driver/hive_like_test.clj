(ns metabase.driver.hive-like-test
  "Do not mark this as ^:mb/driver-tests. CI will not see this file since this is an abstract driver."
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]))

(deftest ^:parallel database-type->base-type-test
  (testing "make sure the various types we use for running tests are actually mapped to the correct DB type"
    (are [db-type expected] (= expected
                               (sql-jdbc.sync/database-type->base-type :hive-like db-type))
      :string    :type/Text
      :int       :type/Integer
      :date      :type/Date
      :timestamp :type/DateTime
      :double    :type/Float)))
