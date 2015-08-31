(ns metabase.driver.query-processor.parse
  "Logic relating to parsing values associated with different Query Processor `Field` types."
  (:require [metabase.driver.query-processor.interface :refer :all]
            [metabase.util :as u])
  (:import (metabase.driver.query_processor.interface DateTimeField
                                                      Field)))

(defmulti parse-value (fn [field value]
                        (class field)))

(defmethod parse-value Field [field value]
  (map->Value {:field field
               :value value}))

(defmethod parse-value DateTimeField [field value]
  (try (let [value (u/parse-iso8601 value)]
         (map->DateTimeValue {:value value
                              :field field}))
       (catch Throwable _
         (throw (Exception. "Invalid value '%s': expected a DateTime.")))))
