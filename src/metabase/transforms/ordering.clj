(ns metabase.transforms.ordering
  "Transform dependency ordering with error handling for scheduled execution.

   Extends transforms-base/ordering with database routing error handling."
  (:require
   [metabase.transforms-base.interface :as transforms-base.i]
   ;; Load base ordering - this registers the default implementations
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.util.i18n :as i18n]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

;; Re-export ordering functions from transforms-base
(p/import-vars
 [metabase.transforms-base.ordering
  query-table-dependencies
  transform-ordering
  find-cycle
  get-transform-cycle
  available-transforms])

;;; ------------------------------------------------- Error Handling -------------------------------------------------

(defn- database-routing-error-ex-data [^Throwable e]
  (when e
    (if (:database-routing-enabled (ex-data e))
      (ex-data e)
      (recur (.getCause e)))))

;; Override the :query implementation to add database routing error handling
;; This wraps the base implementation with job-failure context
(defmethod transforms-base.i/table-dependencies :query
  [transform]
  (try
    (transforms-base.ordering/query-table-dependencies transform)
    (catch clojure.lang.ExceptionInfo e
      (if-some [data (database-routing-error-ex-data e)]
        (let [message (i18n/trs "Failed to run transform because the database {0} has database routing turned on. Running transforms on databases with db routing enabled is not supported." (:database-name data))]
          (throw (ex-info message
                          {:metabase.transforms.jobs/transform-failure true
                           :metabase.transforms.jobs/failures [{:metabase.transforms.jobs/transform transform
                                                                :metabase.transforms.jobs/message message}]}
                          e)))
        (throw e)))))
