(ns metabase.timeline.db
  "Application database queries for the timeline module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.collections.listing :as collections.listing]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn synced-timeline-events-clause :- [:fn vector?]
  "The clause over the TimelineEvent table aliased `alias` selecting the events of the timelines remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (remote-sync/synced-fk-clause alias :timeline_id :model/Timeline opts))

(mu/defn synced-timelines-clause :- [:fn vector?]
  "The clause over the Timeline table aliased `alias` selecting the timelines remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  [:and
   (when-not (:include-archived? opts)
     [:= (u/qualified-key alias :archived) false])
   (remote-sync/synced-fk-clause alias :collection_id :model/Collection opts)])

(mu/defn insert-timelines!
  "Insert the Timeline `rows` and return the inserted instances."
  [rows :- [:sequential ::timeline.schema/timeline.create]]
  (app-db/insert-returning-instances! :model/Timeline rows))

(mu/defn timelines-in-visible-collections
  "The Timelines whose archived flag is `archived` in the Collections visible to the current user, in
  case-insensitive name order."
  [archived :- :boolean]
  (t2/select :model/Timeline
             {:where    [:and
                         [:= :archived archived]
                         (perms/visible-collections-filter-clause :timeline.collection_id (api/current-user-info) {:root-namespace nil})]
              :order-by [[:%lower.name :asc]]}))

(mu/defn timeline
  "The Timeline with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Timeline :id id))

(mu/defn timelines-by-id
  "A map of id to Timeline for the Timelines with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn identity :model/Timeline :id [:in ids]))

(mu/defn timelines-for-collection
  "The Timelines of the Collection with `collection-id` whose archived flag is `archived`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   archived      :- :boolean]
  (t2/select :model/Timeline :collection_id collection-id :archived archived))

(mu/defn archived-directly-clause
  "The SQL expression for the `archived_directly` of a Timeline that `changes` archives or restores: true when it is
  archived and its Collection is not, false on a restore, which no stored value equals so that the statement writes it for
  every row."
  [changes :- :map]
  (if (:archived changes)
    [:case [:= ^:allow-subquery {:select [:parent.archived]
                                 :from   [[:collection :parent]]
                                 :where  [:= :parent.id (if (contains? changes :collection_id)
                                                          [:auto/param (:collection_id changes)]
                                                          :timeline.collection_id)]}
            true]
     false
     :else true]
    [:inline false]))

(mu/defn update-timelines! :- :nil
  "Apply each of `updates`, the `:id` of a Timeline and the columns to change, with one statement for each set of columns
  that rows have in common."
  [updates :- [:sequential :map]]
  (app-db/update-grouped! :model/Timeline updates)
  nil)

(mu/defn unarchived-timelines-in-collections
  "The unarchived Timelines in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Timeline :collection_id [:in collection-ids] :archived false))

(mu/defn restorable-timelines-in-collections
  "The Timelines in the Collections with `collection-ids` that were archived along with them."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Timeline :collection_id [:in collection-ids] :archived true :archived_directly false))

(mu/defn timelines-in-collections
  "The Timelines in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Timeline :collection_id [:in collection-ids]))

(mu/defn events-of-timelines-by-archived
  "The TimelineEvents of the Timelines with `timeline-ids` whose archived flag is `archived`."
  [timeline-ids :- [:sequential ms/PositiveInt]
   archived     :- :boolean]
  (t2/select :model/TimelineEvent :timeline_id [:in timeline-ids] :archived archived))

(mu/defn delete-timelines!
  "Delete the Timelines with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/Timeline :id [:in ids]))

(mu/defn delete-timelines-in-collections!
  "Delete the Timelines in the Collections with `collection-ids`, returning the number deleted."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/delete! :model/Timeline :collection_id [:in collection-ids]))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn insert-timeline-events!
  "Insert the TimelineEvent `rows` and return the inserted instances."
  [rows :- [:sequential ::timeline.schema/timeline-event.create]]
  (app-db/insert-returning-instances! :model/TimelineEvent rows))

(mu/defn timeline-event
  "The TimelineEvent with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TimelineEvent :id id))

(mu/defn timeline-events-for-timelines
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

(mu/defn timeline-events-by-id
  "A map of id to TimelineEvent for the TimelineEvents with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn identity :model/TimelineEvent :id [:in ids]))

(mu/defn icon-clause
  "The SQL expression for the icon of a new event of the Timeline with `timeline-id`: the icon of the Timeline, or
  `default-icon` when it has none."
  [timeline-id  :- ms/PositiveInt
   default-icon :- :string]
  [:coalesce ^:allow-subquery {:select [:timeline.icon]
                               :from   [:timeline]
                               :where  [:= :timeline.id [:auto/param timeline-id]]}
   default-icon])

(mu/defn update-timeline-events! :- :nil
  "Apply each of `updates`, the `:id` of a TimelineEvent and the columns to change, with one statement for each set of columns
  that rows have in common."
  [updates :- [:sequential :map]]
  (app-db/update-grouped! :model/TimelineEvent updates)
  nil)

(mu/defn delete-timeline-events!
  "Delete the TimelineEvents with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/TimelineEvent :id [:in ids]))

(mu/defn synced-timeline-items :- [:sequential ::timeline.schema/timeline]
  "The Timelines with `ids`, with their Collection and its ancestors, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (t2/select [:model/Timeline :id :name :collection_id] :id [:in ids])
        (t2/hydrate [:collection :effective_ancestors])
        (->> (mapv #(collection.root/hydrate-root-collection % root))))))

(mu/defn collection-timeline-items :- [:maybe :map]
  "The query of the Timelines in `collection` that the collection items listing of `opts` holds, nil when
  `opts` restrict the items to those created by a user, which Timelines do not record,
  and none of them when `opts` restrict the items to the pinned ones, which no Timeline is."
  [collection                                       :- :map
   {:keys [archived? pinned-state created-by-id]} :- :map]
  (when (nil? created-by-id)
    {:select [:id :collection_id :name [(h2x/literal "timeline") :model] :description :entity_id :icon]
     :from   [[:timeline :timeline]]
     :where  [:and
              (collections.listing/poison-when-pinned-clause pinned-state)
              [:= :collection_id (:id collection)]
              [:= :archived (boolean archived?)]]}))
