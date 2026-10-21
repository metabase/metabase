(ns metabase.timeline.db.fetch
  "Application database reads by id for the timeline module. Reads only: writes go in [[metabase.timeline.db]]."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn timelines-by-id
  "A map of id to Timeline for the Timelines with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn identity :model/Timeline :id [:in ids]))

(mu/defn timeline-events-by-id
  "A map of id to TimelineEvent for the TimelineEvents with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn identity :model/TimelineEvent :id [:in ids]))
