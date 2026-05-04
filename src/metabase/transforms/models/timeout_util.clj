(ns metabase.transforms.models.timeout-util
  "Pure helpers shared by the transform-run and job-run timeout sweepers."
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
