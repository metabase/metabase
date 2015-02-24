(ns metabase.driver.postgres.query-processor
  (:require [metabase.driver.generic-sql.query-processor :as generic]
            [metabase.driver.query-processor :as driver]))

(defmethod driver/process2 :postgres [query]
  (let [results (eval (generic/process query))]
    results))
