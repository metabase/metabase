(ns metabase.driver.query-processor.parse
  "Logic relating to parsing values associated with different Query Processor `Field` types."
  (:require [clojure.core.match :refer [match]]
            [metabase.driver.query-processor.interface :refer :all]
            [metabase.util :as u])
  (:import (metabase.driver.query_processor.interface DateTimeField
                                                      Field)))

(defprotocol IParseValueForField
  (parse-value [this value]
    "Parse a value for a given type of `Field`."))

(extend-protocol IParseValueForField
  Field
  (parse-value [this value]
    (map->Value {:field this, :value value}))

  DateTimeField
  (parse-value [this value]
    (match value
      (_ :guard u/date-string?)
      (map->DateTimeValue {:field this, :value (u/->Timestamp value)})

      ["relative_datetime" "current"]
      (map->RelativeDateTimeValue {:amount 0, :field this})

      ["relative_datetime" (amount :guard integer?) (unit :guard relative-datetime-value-unit?)]
      (map->RelativeDateTimeValue {:amount amount
                                   :field  this
                                   :unit   (keyword unit)})

      _ (throw (Exception. (format "Invalid value '%s': expected a DateTime." value))))))
