(ns metabase.driver.sql.query-processor.deprecated
  "Deprecated stuff that used to live in [[metabase.driver.sql.query-processor]]. Moved here so it can live out its last
  days in a place we don't have to look at it, and to discourage people from using it. Also convenient for seeing
  everything that's deprecated at a glance.

  Deprecated method impls should call [[log-deprecation-warning]] to gently nudge driver authors to stop using this
  method."
  (:require
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]))

;;; This is unused at this moment in time but we can leave it around in case we want to use it again in the
;;; future (likely). See the code at `v0.45.0` for example where we were using this a lot

;; TODO -- this is actually pretty handy and I think we ought to use it for all the deprecated driver methods.
(defn log-deprecation-warning
  "Log a warning about usage of a deprecated method.

    (log-deprecation-warning driver 'my.namespace/method \"v0.42.0\")"
  [driver method-name deprecated-version]
  (letfn [(thunk []
            (log/warn (u/format-color :red
                                      (str "Warning: Driver %s is using %s. This method was deprecated in %s and will"
                                           " be removed in a future release.")
                                      driver method-name deprecated-version)))]
    ;; only log each individual message once for the current QP store; by 'caching' the value with the key it is
    ;; effectively memoized for the rest of the QP run for the current query. The goal here is to avoid blasting the
    ;; logs with warnings about deprecated method calls, but still remind people regularly enough that it gets fixed
    ;; sometime in the near future.
    (if (qp.store/initialized?)
      (qp.store/cached [driver method-name deprecated-version]
        (thunk))
      (thunk))))
