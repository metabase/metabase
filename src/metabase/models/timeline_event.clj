(ns metabase.models.timeline-event
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TimelineEvent  [_model] :timeline_event)

(doto :model/TimelineEvent
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

;;;; schemas

(def default-icon
  "The default icon for Timeline and TimelineEvents."
  "star")

(def Icon
  "Schema for Timeline and TimelineEvents `icon`"
  [:enum default-icon "cake" "mail" "warning" "bell" "cloud"])

(def Source
  "Timeline Event Source Schema. For Snowplow Events, where the Event is created from is important.
  Events are added from one of three sources: `collections`, `questions` (cards in backend code), or directly with an API call. An API call is indicated by having no source key in the `timeline-event` request."
  [:enum "collections" "question"])

;;;; transforms

(t2/define-after-select :model/TimelineEvent
  [timeline-event]
  ;; We used to have a "balloons" icon but we removed it.
  ;; Use the default icon instead. (metabase#34586, metabase#35129)
  (update timeline-event :icon (fn [icon]
                                 (if (= icon "balloons") default-icon icon))))

;;;; permissions

(defmethod mi/perms-objects-set :model/TimelineEvent
  [event read-or-write]
  (let [timeline (or (:timeline event)
                     (t2/select-one 'Timeline :id (:timeline_id event)))]
    (mi/perms-objects-set timeline read-or-write)))

;;;; hydration

(methodical/defmethod t2/batched-hydrate [:model/TimelineEvent :timeline]
  [_model k events]
  (mi/instances-with-hydrated-data
   events k
   #(t2/select-pk->fn identity :model/Timeline :id [:in (map :timeline_id events)])
   :timeline_id))

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
    (t2/hydrate (t2/select :model/TimelineEvent clause) :creator)))

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

;; nested in Timeline
(defmethod serdes/make-spec "TimelineEvent" [_model-name _opts]
  {:copy      [:archived :description :icon :name :time_matters :timezone]
   :skip      []
   :transform {:created_at  (serdes/date)
               :creator_id  (serdes/fk :model/User)
               :timeline_id (serdes/parent-ref)
               :timestamp   (serdes/date)}})
