(ns metabase.transforms.freshness
  "Decides which transforms pulled into a job's plan only as dependencies are already fresh — no
  scheduled fire time has passed since their last successful run — and can be skipped."
  (:require
   [java-time.api :as t]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.models.transform-tag :as transform-tag]
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

(defn fresh-dep-ids
  "Subset of `dep-ids` safe to skip as of `now`: a dep that has never succeeded is never fresh; a
  scheduled one is fresh while none of its schedules has fired since its last success; an unscheduled
  one is fresh once it has succeeded."
  [now dep-ids]
  (when (seq dep-ids)
    (let [schedules-by-id (transform-tag/schedules-for-transforms dep-ids)
          last-success    (transform-run/last-successful-run-times dep-ids)
          now-date        (Date/from (t/instant now))]
      (into #{}
            (keep (fn [id]
                    (when-let [ran (last-success id)]
                      (let [ran-date (Date/from (t/instant ran))]
                        (when (not-any? #(fired-since? % ran-date now-date)
                                        (schedules-by-id id))
                          id)))))
            dep-ids))))
