(ns metabase.test.data.presto-common
  "Common functionality for handling test datasets in Presto."
  (:require [metabase.test.data.interface :as tx]))

(defmethod tx/aggregate-column-info :presto-common
  ([driver ag-type]
   ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type))

  ([driver ag-type field]
   (merge
     ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
     (when (= ag-type :sum)
       {:base_type :type/BigInteger}))))

(prefer-method tx/aggregate-column-info :presto-common ::tx/test-extensions)
