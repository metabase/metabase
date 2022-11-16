(ns metabase.models.timeline-event
  (:require [metabase.models.interface :as mi]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

(models/defmodel TimelineEvent :timeline_event)

(doto TimelineEvent
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

;;;; schemas

(def Sources
  "Timeline Event Source Schema. For Snowplow Events, where the Event is created from is important.
  Events are added from one of three sources: `collections`, `questions` (cards in backend code), or directly with an API call. An API call is indicated by having no source key in the `timeline-event` request."
  (s/enum "collections" "question"))

;;;; permissions

(defmethod mi/perms-objects-set TimelineEvent
  [event read-or-write]
  (let [timeline (or (:timeline event)
                     (db/select-one 'Timeline :id (:timeline_id event)))]
    (mi/perms-objects-set timeline read-or-write)))

;;;; hydration

(defn timeline
  "Attach the parent `:timeline` to this [[TimelineEvent]]."
  {:hydrate :timeline}
  [{:keys [timeline_id]}]
  (db/select-one 'Timeline :id timeline_id))

;(hydrate (db/select-one 'TimelineEvent))

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
                              [:<= (hx/->date start) (hx/->date :timestamp)])
                            (when end
                              [:<= (hx/->date :timestamp) (hx/->date end)])]])]}]
    (hydrate (db/select TimelineEvent clause) :creator)))

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

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class TimelineEvent)
  models/IModel
  (merge
   models/IModelDefaults
   ;; todo: add hydration keys??
   {:properties (constantly {:timestamped? true})}))

(defmethod serdes.hash/identity-hash-fields TimelineEvent
  [_timeline-event]
  [:name :timestamp (serdes.hash/hydrated-hash :timeline) :created_at])

;;;; serialization
;; TimelineEvents are inlined under their Timelines, but we can reuse the [[load-one!]] logic using [[load-xform]].
(defmethod serdes.base/load-xform "TimelineEvent" [event]
  (-> event
      serdes.base/load-xform-basics
      (update :timeline_id serdes.util/import-fk 'Timeline)
      (update :creator_id  serdes.util/import-user)
      (update :timestamp   u.date/parse)))
