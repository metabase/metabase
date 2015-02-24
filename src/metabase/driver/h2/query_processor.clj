(ns metabase.driver.h2.query-processor
  (:require [metabase.driver.generic-sql.query-processor :as generic]
            [metabase.driver.query-processor :as driver]))

(defmethod driver/process2 :h2 [query]
  (generic/process-and-run query))
