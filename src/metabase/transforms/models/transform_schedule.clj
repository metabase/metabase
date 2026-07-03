(ns metabase.transforms.models.transform-schedule
  "Cron schedules attached to transforms."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- schedules-by-transform-id
  [where]
  (reduce (fn [m {:keys [transform_id schedule]}]
            (update m transform_id (fnil conj #{}) schedule))
          {}
          (t2/select :model/TransformTransformTag
                     {:select [:ttt.transform_id [:job.schedule :schedule]]
                      :from   [[:transform_transform_tag :ttt]]
                      :join   [[:transform_job_transform_tag :jtt] [:= :ttt.tag_id :jtt.tag_id]
                               [:transform_job :job] [:= :jtt.job_id :job.id]]
                      :where  where})))

(defn schedules-for-transforms
  "Map each id in `transform-ids` — or every transform, in the 0-arity — to the cron schedules of the
  active jobs that run it via shared tags. Ids with no such job are absent."
  ([]
   (schedules-by-transform-id [:= :job.active true]))
  ([transform-ids]
   (when (seq transform-ids)
     (schedules-by-transform-id [:and
                                 [:in :ttt.transform_id transform-ids]
                                 [:= :job.active true]]))))
