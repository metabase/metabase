(ns metabase.transforms.freshness
  "Schedule-aware freshness checks. Decides which transforms pulled into a job's plan only as
  dependencies are already fresh — no scheduled fire time has passed since their last successful
  run — and can be skipped ([[fresh-dep-ids]]); also which transforms are simply between fires of
  a slow schedule and so should not be treated as inactive ([[schedule-fresh-transform-ids]])."
  (:require
   [java-time.api :as t]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.models.transform-schedule :as transform-schedule]
   [metabase.util.log :as log])
  (:import
   (java.util Date)
   (org.quartz CronExpression)))

(set! *warn-on-reflection* true)

(defn- fired-since?
  "True if `cron` has a fire time after `last-success` and at or before `now` — i.e. a scheduled run
  was due since the last success. Unparseable crons are ignored."
  [cron ^Date last-success ^Date now]
  (try
    (when-let [next-fire (.getNextValidTimeAfter (CronExpression. ^String cron) last-success)]
      (not (.after next-fire now)))
    (catch Exception e
      (log/warnf e "Ignoring unparseable transform job schedule %s" (pr-str cron))
      false)))

(defn- fresh-ids
  "Subset of `ids` that have a timestamp in `id->last-run` and whose schedules have not fired
  based on `schedules-by-id` since the `now` timestamp.
  IDs with no schedules are fresh once they have a timestamp; IDs with no timestamp are never fresh."
  [now ids schedules-by-id id->last-run]
  (let [now-date (Date/from (t/instant now))]
    (into #{}
          (for [id ids
                :let  [ran (id->last-run id)]
                :when ran
                :let  [ran-date (Date/from (t/instant ran))]
                :when (not-any? #(fired-since? % ran-date now-date) (schedules-by-id id))]
            id))))

(defn schedule-fresh-transform-ids
  "IDs of transforms that are between fires of an active job schedule as of `now`.
  Covered transforms have ≥1 active scheduled job and no schedule fire time has elapsed since
  their most recent run (any status) - e.g. a six-month cadence whose last run was two months
  ago - and should not be treated as inactive by recency checks like staleness. Transforms that
  have never run are never schedule-fresh."
  [now]
  (let [schedules-by-id (transform-schedule/schedules-for-transforms)
        ids             (keys schedules-by-id)]
    (fresh-ids now ids schedules-by-id (transform-run/last-run-start-times ids))))

(defn fresh-dep-ids
  "Subset of `dep-ids` safe to skip as of `now`: a dep that has never succeeded is never fresh; a
  scheduled one is fresh while none of its schedules has fired since its last success; an unscheduled
  one is fresh once it has succeeded."
  [now dep-ids]
  (when (seq dep-ids)
    (fresh-ids now dep-ids
               (transform-schedule/schedules-for-transforms dep-ids)
               (transform-run/last-successful-run-times dep-ids))))
