(ns metabase.models.timeline-event
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

(models/defmodel TimelineEvent :timeline_event)

;;;; schemas

(def Sources
  "Timeline Event Source Schema. For Snowplow Events, where the Event is created from is important.
  Events are added from one of three sources: `collections`, `questions` (cards in backend code), or directly with an API call. An API call is indicated by having no source key in the `timeline-event` request."
  (s/enum "collections" "question"))

;;;; permissions

(defn- perms-objects-set
  [event read-or-write]
  (let [timeline (or (:timeline event)
                     (db/select-one 'Timeline :id (:timeline_id event)))]
    (i/perms-objects-set timeline read-or-write)))

;;;; hydration

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

(u/strict-extend (class TimelineEvent)
  models/IModel
  (merge
   models/IModelDefaults
   ;; todo: add hydration keys??
   {:properties (constantly {:timestamped? true})})

  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:perms-objects-set perms-objects-set
    :can-read?         (partial i/current-user-has-full-permissions? :read)
    :can-write?        (partial i/current-user-has-full-permissions? :write)}))
