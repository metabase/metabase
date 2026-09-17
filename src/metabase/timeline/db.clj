(ns metabase.timeline.db
  "Application database queries for `:model/Timeline` and `:model/TimelineEvent`. Every function here is a direct
  Toucan 2 call with no additional logic, so no other namespace in the module runs a query itself (model
  definitions still use `toucan2.core`).

  The queries below follow [[::timeline-opts]] and [[::timeline-event-opts]]; queries that do not fit them live in
  the timeline-only section at the bottom of this namespace."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::timeline-filters
  "Which Timelines a query applies to. Keys mirror the columns of `timeline`: a scalar matches that value and a set
  matches any of its values."
  [:map {:closed true}
   [:id            {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:archived      {:optional true} :boolean]])

(mr/def ::timeline-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::timeline-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::timeline.schema/timeline.column]]
    [:order-by {:optional true} [:sequential ::timeline.schema/timeline.column]]]])

(mr/def ::timeline-event-filters
  "Which TimelineEvents a query applies to. Keys mirror the columns of `timeline_event`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id          {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:timeline_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:archived    {:optional true} :boolean]])

(mr/def ::timeline-event-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::timeline-event-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::timeline.schema/timeline-event.column]]
    [:order-by {:optional true} [:sequential ::timeline.schema/timeline-event.column]]]])

(defn- ->timeline-model
  [columns]
  (u.query/model-with-columns :model/Timeline columns))

(defn- ->timeline-args
  [opts]
  (u.query/opts->args opts))

(defn- ->timeline-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(defn- ->timeline-event-model
  [columns]
  (u.query/model-with-columns :model/TimelineEvent columns))

(defn- ->timeline-event-args
  [opts]
  (u.query/opts->args opts))

(defn- ->timeline-event-kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-timelines :- [:sequential ::timeline.schema/timeline.partial]
  "The Timelines matching `opts`."
  ([]
   (select-timelines nil))
  ([{:keys [columns] :as opts} :- [:maybe ::timeline-opts]]
   (apply t2/select (->timeline-model columns) (->timeline-args opts))))

(mu/defn select-one-timeline :- [:maybe ::timeline.schema/timeline.partial]
  "The first Timeline matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::timeline-opts]]
  (apply t2/select-one (->timeline-model columns) (->timeline-args opts)))

(mu/defn select-timeline-pk->instance :- [:map-of ms/PositiveInt ::timeline.schema/timeline.partial]
  "A map of id to the Timeline matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::timeline-opts]]
  (apply t2/select-pk->fn identity (u.query/model-with-pk-columns :model/Timeline :id columns) (->timeline-args opts)))

(mu/defn select-one-timeline-event :- [:maybe ::timeline.schema/timeline-event.partial]
  "The first TimelineEvent matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::timeline-event-opts]]
  (apply t2/select-one (->timeline-event-model columns) (->timeline-event-args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-timeline! :- ::timeline.schema/timeline
  "Insert the Timeline `row` and return the inserted instance."
  [row :- ::timeline.schema/timeline.update]
  (t2/insert-returning-instance! :model/Timeline row))

(mu/defn update-timelines! :- :int
  "Apply `changes` to every Timeline matching `opts`, returning the number updated."
  [opts    :- [:maybe ::timeline-opts]
   changes :- ::timeline.schema/timeline.update]
  (apply t2/update! :model/Timeline (conj (->timeline-kv-args opts) changes)))

(mu/defn delete-timelines! :- :int
  "Delete every Timeline matching `opts`, returning the number deleted."
  [opts :- [:maybe ::timeline-opts]]
  (apply t2/delete! :model/Timeline (->timeline-args opts)))

(mu/defn insert-timeline-event! :- ::timeline.schema/timeline-event
  "Insert the TimelineEvent `row` and return the inserted instance."
  [row :- ::timeline.schema/timeline-event.update]
  (t2/insert-returning-instance! :model/TimelineEvent row))

(mu/defn update-timeline-events! :- :int
  "Apply `changes` to every TimelineEvent matching `opts`, returning the number updated."
  [opts    :- [:maybe ::timeline-event-opts]
   changes :- ::timeline.schema/timeline-event.update]
  (apply t2/update! :model/TimelineEvent (conj (->timeline-event-kv-args opts) changes)))

(mu/defn delete-timeline-events! :- :int
  "Delete every TimelineEvent matching `opts`, returning the number deleted."
  [opts :- [:maybe ::timeline-event-opts]]
  (apply t2/delete! :model/TimelineEvent (->timeline-event-args opts)))

;;; ------------------------------- Queries used only by the timeline module -------------------------------

(mu/defn select-timelines-in-visible-collections :- [:sequential ::timeline.schema/timeline]
  "The Timelines whose archived flag is `archived` in the Collections visible to the current user, in
  case-insensitive name order."
  [archived :- :boolean]
  (t2/select :model/Timeline
             {:where    [:and
                         [:= :archived archived]
                         (collection/visible-collection-filter-clause)]
              :order-by [[:%lower.name :asc]]}))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn select-timeline-events-for-timelines :- [:sequential ::timeline.schema/timeline-event]
  "The TimelineEvents of the Timelines with `timeline-ids`, unarchived only unless `all?`, and (when `start` and/or
  `end` are given) within that time range (respecting each event's `:time_matters` flag)."
  [timeline-ids :- [:sequential ms/PositiveInt]
   all?         :- [:maybe :boolean]
   start        :- [:maybe ms/TemporalInstant]
   end          :- [:maybe ms/TemporalInstant]]
  (t2/select :model/TimelineEvent
             {:where [:and
                      [:in :timeline_id timeline-ids]
                      (when-not all?
                        [:= :archived false])
                      (when (or start end)
                        [:or
                         [:and
                          [:= :time_matters true]
                          (when start
                            [:<= start :timestamp])
                          (when end
                            [:<= :timestamp end])]
                         [:and
                          [:= :time_matters false]
                          (when start
                            [:<= (h2x/->date start) (h2x/->date :timestamp)])
                          (when end
                            [:<= (h2x/->date :timestamp) (h2x/->date end)])]])]}))
