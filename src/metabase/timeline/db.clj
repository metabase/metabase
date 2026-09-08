(ns metabase.timeline.db
  "Application database queries for the timeline module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn insert-timeline! :- (ms/InstanceOf :model/Timeline)
  "Insert the Timeline `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:name          :string]
           [:creator_id    ms/PositiveInt]
           [:default       {:optional true} [:maybe :boolean]]
           [:description   {:optional true} [:maybe :string]]
           [:icon          {:optional true} [:maybe :string]]
           [:collection_id {:optional true} [:maybe ms/PositiveInt]]
           [:archived      {:optional true} [:maybe :boolean]]]]
  (t2/insert-returning-instance! :model/Timeline row))

(mu/defn timelines-in-collections :- [:sequential (ms/InstanceOf :model/Timeline)]
  "The Timelines whose archived flag is `archived` in the Collections matching the Honey SQL `collection-clause`, in
  case-insensitive name order."
  [archived          :- :boolean
   collection-clause :- :any]
  (t2/select :model/Timeline
             {:where    [:and
                         [:= :archived archived]
                         collection-clause]
              :order-by [[:%lower.name :asc]]}))

(mu/defn timeline :- [:maybe (ms/InstanceOf :model/Timeline)]
  "The Timeline with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Timeline :id id))

(mu/defn timeline-icon :- [:maybe :string]
  "The icon of the Timeline with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :icon :model/Timeline :id id))

(mu/defn timelines-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Timeline)]
  "A map of id to Timeline for the Timelines with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity :model/Timeline :id [:in ids]))

(mu/defn timelines-for-collection :- [:sequential (ms/InstanceOf :model/Timeline)]
  "The Timelines of the Collection with `collection-id` whose archived flag is `archived`."
  [collection-id :- [:maybe ms/PositiveInt]
   archived      :- :boolean]
  (t2/select :model/Timeline :collection_id collection-id :archived archived))

(mu/defn update-timeline! :- :int
  "Apply `changes` to the Timeline with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:name          {:optional true} :string]
               [:default       {:optional true} [:maybe :boolean]]
               [:description   {:optional true} [:maybe :string]]
               [:icon          {:optional true} [:maybe :string]]
               [:collection_id {:optional true} [:maybe ms/PositiveInt]]
               [:archived      {:optional true} [:maybe :boolean]]]]
  (t2/update! :model/Timeline id changes))

(mu/defn set-timeline-events-archived! :- :int
  "Set the archived flag of the TimelineEvents of the Timeline with `timeline-id`, returning the number updated."
  [timeline-id :- ms/PositiveInt
   archived    :- :boolean]
  (t2/update! :model/TimelineEvent {:timeline_id timeline-id} {:archived archived}))

(mu/defn delete-timeline! :- :int
  "Delete the Timeline with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Timeline :id id))

(mu/defn collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ms/PositiveInt]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn insert-timeline-event! :- (ms/InstanceOf :model/TimelineEvent)
  "Insert the TimelineEvent `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:name         :string]
           [:timestamp    ms/TemporalInstant]
           [:timezone     :string]
           [:timeline_id  ms/PositiveInt]
           [:creator_id   ms/PositiveInt]
           [:description  {:optional true} [:maybe :string]]
           [:time_matters {:optional true} [:maybe :boolean]]
           [:icon         {:optional true} [:maybe :string]]
           [:archived     {:optional true} [:maybe :boolean]]]]
  (t2/insert-returning-instance! :model/TimelineEvent row))

(mu/defn timeline-event :- [:maybe (ms/InstanceOf :model/TimelineEvent)]
  "The TimelineEvent with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TimelineEvent :id id))

(mu/defn timeline-events-for-timelines :- [:sequential (ms/InstanceOf :model/TimelineEvent)]
  "The TimelineEvents of the Timelines with `timeline-ids`, unarchived only unless `all?`, and (when `start` and/or
  `end` are given) within that time range (respecting each event's `:time_matters` flag)."
  [timeline-ids :- [:seqable ms/PositiveInt]
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

(mu/defn update-timeline-event! :- :int
  "Apply `changes` to the TimelineEvent with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:name         {:optional true} :string]
               [:description  {:optional true} [:maybe :string]]
               [:timestamp    {:optional true} [:maybe ms/TemporalInstant]]
               [:time_matters {:optional true} [:maybe :boolean]]
               [:timezone     {:optional true} [:maybe :string]]
               [:icon         {:optional true} [:maybe :string]]
               [:timeline_id  {:optional true} [:maybe ms/PositiveInt]]
               [:archived     {:optional true} [:maybe :boolean]]]]
  (t2/update! :model/TimelineEvent id changes))

(mu/defn delete-timeline-event! :- :int
  "Delete the TimelineEvent with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/TimelineEvent :id id))
