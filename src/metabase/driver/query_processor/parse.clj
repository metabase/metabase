(ns metabase.driver.query-processor.parse
  "Logic relating to parsing values associated with different Query Processor `Field` types."
  (:require [metabase.driver.query-processor.interface :refer :all]
            [metabase.util :as u])
  (:import (metabase.driver.query_processor.interface DateTimeField
                                                      Field
                                                      RelativeDatetime)))

(defprotocol IParseValueForField
  (parse-value [this value]
    "Parse a value for a given type of `Field`."))

(extend-protocol IParseValueForField
  Field
  (parse-value [this value]
    (map->Value {:field this, :value value}))

  DateTimeField
  (parse-value [this value]
    (cond
      (u/date-string? value)
      (map->DateTimeValue {:field this, :value (u/->Timestamp value)})

      (instance? RelativeDatetime value)
      (map->RelativeDateTimeValue {:field this, :amount (:amount value), :unit (:unit value)})

      :else
      (throw (Exception. (format "Invalid value '%s': expected a DateTime." value))))))
