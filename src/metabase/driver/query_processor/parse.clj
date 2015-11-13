(ns metabase.driver.query-processor.parse
  "Logic relating to parsing values associated with different Query Processor `Field` types."
  (:require [clojure.core.match :refer [match]]
            [metabase.driver.query-processor.interface :refer :all]
            [metabase.util :as u])
  (:import (metabase.driver.query_processor.interface DateTimeField
                                                      Field)))

(defmulti parse-value (fn [field value]
                        (class field)))

(defmethod parse-value Field [field value]
  (map->Value {:field field
               :value value}))

(defmethod parse-value DateTimeField [field value]
  (match value
    (_ :guard u/date-string?)
    (map->DateTimeValue {:field field
                         :value (u/->Timestamp value)})

    ["relative_datetime" "current"]
    (map->RelativeDateTimeValue {:amount 0, :field field})

    ["relative_datetime" (amount :guard integer?) (unit :guard relative-datetime-value-unit?)]
    (map->RelativeDateTimeValue {:amount amount
                                 :field  field
                                 :unit   (keyword unit)})

    _ (throw (Exception. (format "Invalid value '%s': expected a DateTime." value)))))
