(ns metabase.driver.postgres.query-processor
  (:require (metabase.driver.generic-sql [native :as native]
                                         [query-processor :as generic])
            [metabase.driver :refer [process-and-run]]))


(defmethod process-and-run :postgres [query]
  (binding [native/*timezone->set-timezone-sql* (fn [timezone]
                                                  (format "SET LOCAL timezone TO '%s';" timezone))]
    (generic/process-and-run query)))
