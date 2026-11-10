(ns metabase.transforms.models.transform-schedule
  "Cron schedules attached to transforms."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.transforms.db :as transforms.db]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- schedules-by-transform-id :- [:map-of ::lib.schema.id/transform [:set :string]]
  [rows :- [:sequential [:map {:closed true} [:transform_id ::lib.schema.id/transform] [:schedule :string]]]]
  (reduce (fn [m {:keys [transform_id schedule]}]
            (update m transform_id (fnil conj #{}) schedule))
          {}
          rows))

(mu/defn schedules-for-transforms :- [:maybe [:map-of ::lib.schema.id/transform [:set :string]]]
  "Map each id in `transform-ids` — or every transform, in the 0-arity — to the cron schedules of the
  active jobs that run it via shared tags. Ids with no such job are absent."
  ([]
   (schedules-by-transform-id (transforms.db/active-job-schedules)))
  ([transform-ids :- [:maybe [:or [:set ::lib.schema.id/transform] [:sequential ::lib.schema.id/transform]]]]
   (when (seq transform-ids)
     (schedules-by-transform-id (transforms.db/active-job-schedules-for-transforms transform-ids)))))
