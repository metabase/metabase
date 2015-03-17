(ns metabase.driver.postgres.metadata
  (:require [metabase.driver.generic-sql.metadata :as generic]
            [metabase.driver :refer [field-count field-distinct-count]]))

(defmethod field-count :postgres [field]
  (generic/field-count field))

(defmethod field-distinct-count :postgres [field]
  (generic/field-distinct-count field))
