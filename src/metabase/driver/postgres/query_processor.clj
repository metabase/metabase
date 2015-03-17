(ns metabase.driver.postgres.query-processor
  (:require [metabase.driver.generic-sql.query-processor :as generic]
            [metabase.driver :refer [process-and-run]]))

(defmethod process-and-run :postgres [query]
  (generic/process-and-run query))
