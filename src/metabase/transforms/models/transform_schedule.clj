(ns metabase.transforms.models.transform-schedule
  "Cron schedules attached to transforms."
  (:require
   [metabase.transforms.db :as transforms.db]))

(set! *warn-on-reflection* true)

(defn- schedules-by-transform-id
  [rows]
  (reduce (fn [m {:keys [transform_id schedule]}]
            (update m transform_id (fnil conj #{}) schedule))
          {}
          rows))

(defn schedules-for-transforms
  "Map each id in `transform-ids` — or every transform, in the 0-arity — to the cron schedules of the
  active jobs that run it via shared tags. Ids with no such job are absent."
  ([]
   (schedules-by-transform-id (transforms.db/active-job-schedules)))
  ([transform-ids]
   (when (seq transform-ids)
     (schedules-by-transform-id (transforms.db/active-job-schedules-for-transforms transform-ids)))))
