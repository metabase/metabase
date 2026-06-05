(ns metabase.transforms.freshness
  "Decides which transforms pulled into a job's plan only as dependencies are already fresh — have a
  recent enough successful run for their own cadence — and can be skipped."
  (:require
   [java-time.api :as t]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.util.log :as log])
  (:import
   (java.time Duration)
   (java.util Date)
   (org.quartz CronExpression)))

(set! *warn-on-reflection* true)

(defn- cron-interval
  "Duration between the next two fire times of `cron` after `now`, or nil if it can't fire twice or is
  unparseable."
  ^Duration [cron ^Date now]
  (try
    (let [expr (CronExpression. ^String cron)]
      (when-let [t1 (.getNextValidTimeAfter expr now)]
        (when-let [t2 (.getNextValidTimeAfter expr t1)]
          (Duration/ofMillis (- (.getTime t2) (.getTime t1))))))
    (catch Exception e
      (log/warnf e "Ignoring unparseable transform job schedule %s" (pr-str cron))
      nil)))

(defn- window
  "A transform's cadence as of `now`: the shortest fire interval among `schedules`, or nil if none apply."
  ^Duration [^Date now schedules]
  (->> schedules
       (keep #(cron-interval % now))
       (sort-by #(.toMillis ^Duration %))
       first))

(defn fresh-dep-ids
  "Subset of `dep-ids` safe to skip as of `now`: a dep that has never succeeded is never fresh; a
  scheduled one is fresh within its cadence; an unscheduled one is fresh once it has succeeded."
  [now dep-ids]
  (when (seq dep-ids)
    (let [schedules-by-id (transform-tag/schedules-for-transforms dep-ids)
          last-success    (transform-run/last-successful-run-times dep-ids)
          now-date        (Date/from (t/instant now))]
      (into #{}
            (keep (fn [id]
                    (when-let [ran (last-success id)]
                      (if-let [w (window now-date (schedules-by-id id))]
                        (when (t/after? ran (t/minus now w)) id)
                        id))))
            dep-ids))))
