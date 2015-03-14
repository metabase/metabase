(ns metabase.driver.h2.query-processor
  (:require [metabase.driver.generic-sql.query-processor :as generic]
            [metabase.driver :refer [process-and-run]]))

(defmethod process-and-run :h2 [query]
  (generic/process-and-run query))
