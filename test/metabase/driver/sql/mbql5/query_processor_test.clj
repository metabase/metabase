(ns metabase.driver.sql.mbql5.query-processor-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.query-processor :as sql.qp]))

(deftest ^:parallel case-test
  (are [mbql expected] (= expected
                          (sql.qp/->honeysql :sql/mbql5 mbql))

    [:case
     {:lib/uuid "aaa85291-b939-4d43-aa0c-9a06095b9707"}
     [[[:= {:lib/uuid "486b41f9-cb03-4377-95b3-1824cfdc56ca"} 1 1] 1]
      [[:= {:lib/uuid "0ff968f8-5c16-4e40-9ff1-c4beb6bac78a"} 1 1] 1]]]
    [:case
     [:= {:lib/uuid "486b41f9-cb03-4377-95b3-1824cfdc56ca"} 1]
     1
     [:= {:lib/uuid "0ff968f8-5c16-4e40-9ff1-c4beb6bac78a"} 1]
     1]

    [:case
     {:lib/uuid "aaa85291-b939-4d43-aa0c-9a06095b9707"}
     [[[:= {:lib/uuid "486b41f9-cb03-4377-95b3-1824cfdc56ca"} 1 1] 1]
      [[:= {:lib/uuid "0ff968f8-5c16-4e40-9ff1-c4beb6bac78a"} 1 1] 1]
      2]]
    [:case
     [:= {:lib/uuid "486b41f9-cb03-4377-95b3-1824cfdc56ca"} 1]
     1
     [:= {:lib/uuid "0ff968f8-5c16-4e40-9ff1-c4beb6bac78a"} 1]
     1
     :else
     2]))
