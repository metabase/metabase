(ns metabase.driver.h2.metadata
  (:require [metabase.driver.generic-sql.metadata :as generic]
            [metabase.driver :refer [field-count field-distinct-count]]))

(defmethod field-count :h2 [field]
  (generic/field-count field))

(defmethod field-distinct-count :h2 [field]
  (generic/field-distinct-count field))
