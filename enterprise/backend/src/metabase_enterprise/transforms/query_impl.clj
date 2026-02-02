(ns metabase-enterprise.transforms.query-impl
  "Query transform implementation for scheduled execution.

   This namespace provides the scheduled wrapper that creates transform_run rows
   and tracks status. The actual execution logic is in transforms-base.query."
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Scheduled Execution Wrapper -------------------------------------------------

(defn- run-mbql-transform!
  "Execute a query transform with transform_run tracking.

   This wrapper:
   1. Creates a transform_run row via try-start-unless-already-running
   2. Calls the base execution via run-cancelable-transform!
   3. Updates transform_run status on completion/failure"
  ([transform] (run-mbql-transform! transform nil))
  ([{:keys [id owner_user_id creator_id] :as transform} {:keys [run-method start-promise user-id]}]
   (try
     (let [;; For manual runs, use the triggering user; for cron, use owner/creator
           run-user-id (if (and (= run-method :manual) user-id)
                         user-id
                         (or owner_user_id creator_id))
           {run-id :id} (transforms.util/try-start-unless-already-running id run-method run-user-id)]
       (when start-promise
         (deliver start-promise [:started run-id]))
       (transforms.util/run-cancelable-transform! run-id transform {}))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op
         (deliver start-promise t))
       (throw t)))))

;;; ------------------------------------------------- Interface Implementation -------------------------------------------------

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :query [transform opts]
  (run-mbql-transform! transform opts))
