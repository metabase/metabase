(ns metabase.driver.h2.metadata
  (:require [metabase.driver.generic-sql.metadata :as generic]
            [metabase.driver.metadata :as driver]))

(defmethod driver/field-count :h2 [field]
  (generic/field-count field))

(defmethod driver/field-distinct-count :h2 [field]
  (generic/field-distinct-count field))
