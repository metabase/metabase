(ns metabase.transforms.models.timeout-util
  "Helpers shared by the transform-run and job-run timeout sweepers."
  (:require
   [toucan2.core :as t2])
  (:import
   (java.time Duration Instant OffsetDateTime)
   (java.time.temporal ChronoUnit)))

(set! *warn-on-reflection* true)

(defn unit->duration
  "Convert `age` of `unit` (`:second`, `:minute`, or `:hour`) to an exact `java.time.Duration`."
  ^Duration [age unit]
  (Duration/of age (case unit
                     :minute ChronoUnit/MINUTES
                     :second ChronoUnit/SECONDS
                     :hour   ChronoUnit/HOURS)))

(defn detection-latency-ms
  "Milliseconds elapsed past `(reference-ts + timeout-duration)` at the time of detection. Clamped at zero."
  [^OffsetDateTime reference-ts ^Duration timeout-duration ^Instant detected-at]
  (max 0 (.toMillis (.minus (Duration/between (.toInstant reference-ts) detected-at)
                            timeout-duration))))

(defn timeout-rows!
  "Atomically time out active rows of `model` whose `age-column` predates `cutoff`; returns the pre-update rows,
  or `nil` if none were stale.
  Runs SELECT FOR UPDATE + UPDATE in one transaction so the rows callers report on match those the UPDATE
  transitions — without the lock, a concurrent `:is_active` flip between SELECT and UPDATE would leave callers
  counting a timeout that didn't happen. `UPDATE … RETURNING *` would be simpler but isn't portable to H2/MySQL."
  [model age-column cutoff]
  (t2/with-transaction [_conn]
    (when-let [stale (not-empty (t2/select model
                                           {:where [:and
                                                    [:= :is_active true]
                                                    [:< age-column cutoff]]
                                            :for   :update}))]
      (t2/update! model
                  :id        [:in (mapv :id stale)]
                  :is_active true
                  {:status    :timeout
                   :end_time  :%now
                   :is_active nil
                   :message   "Timed out by metabase"})
      stale)))
