(ns metabase.models.timeline-event
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [schema.core :as s]
   [toucan2.core :as t2]))

(def TimelineEvent
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/TimelineEvent)

(methodical/defmethod t2/table-name :model/TimelineEvent  [_model] :timeline_event)

(doto TimelineEvent
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

;;;; schemas

(def Sources
  "Timeline Event Source Schema. For Snowplow Events, where the Event is created from is important.
  Events are added from one of three sources: `collections`, `questions` (cards in backend code), or directly with an API call. An API call is indicated by having no source key in the `timeline-event` request."
  (s/enum "collections" "question"))

;;;; permissions

(defmethod mi/perms-objects-set :model/TimelineEvent
  [event read-or-write]
  (let [timeline (or (:timeline event)
                     (t2/select-one 'Timeline :id (:timeline_id event)))]
    (mi/perms-objects-set timeline read-or-write)))

;;;; hydration

(mi/define-simple-hydration-method timeline
  :timeline
  "Attach the parent `:timeline` to this [[TimelineEvent]]."
  [{:keys [timeline_id]}]
  (t2/select-one 'Timeline :id timeline_id))

(defn- fetch-events
  "Fetch events for timelines in `timeline-ids`. Can include optional `start` and `end` dates in the options map, as
  well as `all?`. By default, will return only unarchived events, unless `all?` is truthy and will return all events
  regardless of archive state."
  [timeline-ids {:events/keys [all? start end]}]
  (let [clause {:where [:and
                        ;; in our collections
                        [:in :timeline_id timeline-ids]
                        (when-not all?
                          [:= :archived false])
                        (when (or start end)
                          [:or
                           ;; absolute time in bounds
                           [:and
                            [:= :time_matters true]
                            ;; less than or equal?
                            (when start
                              [:<= start :timestamp])
                            (when end
                              [:<= :timestamp end])]
                           ;; non-specic time in bounds
                           [:and
                            [:= :time_matters false]
                            (when start
                              [:<= (h2x/->date start) (h2x/->date :timestamp)])
                            (when end
                              [:<= (h2x/->date :timestamp) (h2x/->date end)])]])]}]
    (t2/hydrate (t2/select TimelineEvent clause) :creator)))

(defn include-events
  "Include events on `timelines` passed in. Options are optional and include whether to return unarchived events or all
  events regardless of archive status (`all?`), and `start` and `end` parameters for events."
  [timelines options]
  (if-not (seq timelines)
    []
    (let [timeline-id->events (->> (fetch-events (map :id timelines) options)
                                   (group-by :timeline_id))]
      (for [{:keys [id] :as timeline} timelines]
        (let [events (timeline-id->events id)]
          (when timeline
            (assoc timeline :events (if events events []))))))))

(defn include-events-singular
  "Similar to [[include-events]] but allows for passing a single timeline not in a collection."
  ([timeline] (include-events-singular timeline {}))
  ([timeline options]
   (first (include-events [timeline] options))))

;;;; model

(defmethod serdes/hash-fields :model/TimelineEvent
  [_timeline-event]
  [:name :timestamp (serdes/hydrated-hash :timeline) :created_at])

;;;; serialization
;; TimelineEvents are inlined under their Timelines, but we can reuse the [[load-one!]] logic using [[load-xform]].
(defmethod serdes/load-xform "TimelineEvent" [event]
  (-> event
      serdes/load-xform-basics
      (update :timeline_id serdes/*import-fk* 'Timeline)
      (update :creator_id  serdes/*import-user*)
      (update :timestamp   u.date/parse)
      (update :created_at  #(if (string? %) (u.date/parse %) %))))
