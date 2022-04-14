(ns metabase.models.timeline
  (:require [honeysql.core :as hsql]
            [metabase.models.collection :as collection]
            [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.models.timeline-event :refer [TimelineEvent]]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

(models/defmodel Timeline :timeline)

;;;; schemas

(def Icons
  "Timeline and TimelineEvent icon string Schema"
  (s/enum "star" "balloons" "mail" "warning" "bell" "cloud"))

(def DefaultIcon
  "Timeline default icon"
  "star")

;;;; functions

(defn- root-collection
  []
  (-> (collection/root-collection-with-ui-details nil)
      (hydrate :can_write)))

(defn hydrate-root-collection
  "Hydrate `:collection` on [[Timelines]] when the id is `nil`."
  [{:keys [collection_id] :as timeline}]
  (if (nil? collection_id)
    (assoc timeline :collection (root-collection))
    timeline))


;;;; hydration

(defn- fetch-events
  "Fetch events for timelines in `timeline-ids`. Can include optional `start` and `end` dates in the options map, as
  well as `all?`. By default, will return only unarchived events, unless `all?` is truthy and will return all events
  regardless of archive state."
  [timeline-ids {:events/keys [all? start end]}]
  (let [timeline-icon {:select [[(hsql/call :coalesce :icon DefaultIcon) :tl_icon]
                                [:id :tl_id]]
                       :from [Timeline]}
        query {:select [[(hsql/call :coalesce :icon :tl_icon) :icon] :*]
               :from [TimelineEvent]
               :where [:and
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
                              [:<= (hx/->date :timestamp) (hx/->date end)])]])]
                :left-join [[timeline-icon :tl] [:= :timeline_id :tl_id]]}]
    (hydrate (map #(dissoc % :icon_2 :tl_id :tl_icon) (db/query query)) :creator)))

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

(defn timelines-for-collection
  "Load timelines based on `collection-id` passed in (nil means the root collection). Hydrates the events on each
  timeline at `:events` on the timeline."
  [collection-id {:keys [:timeline/events? :timeline/archived?] :as options}]
  (cond-> (hydrate (db/select Timeline
                              :collection_id collection-id
                              :archived (boolean archived?))
                   :creator
                   [:collection :can_write])
    (nil? collection-id) (->> (map hydrate-root-collection))
    events? (include-events options)))

(defn- post-select
  [{:keys [icon] :as timeline}]
  (assoc timeline :icon (or icon DefaultIcon)))

(u/strict-extend (class Timeline)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true})
    :post-select post-select})

  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)
