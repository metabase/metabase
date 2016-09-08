(ns metabase.driver.mysql-test
  (:require [expectations :refer :all]
            [metabase.test.data :as data]
            (metabase.test.data [datasets :refer [expect-with-engine]]
                                [interface :refer [def-database-definition]])))

;; MySQL allows 0000-00-00 dates, but JDBC does not; make sure that MySQL is converting them to NULL when returning them like we asked
(def-database-definition ^:private ^:const all-zero-dates
  ["exciting-moments-in-history"
   [{:field-name "moment", :base-type :type/DateTime}]
   [["0000-00-00"]]])

(expect-with-engine :mysql
  [[1 nil]]
  (-> (data/dataset metabase.driver.mysql-test/all-zero-dates
        (data/run-query exciting-moments-in-history))
      :data :rows))
