(ns metabase.indexes.db
  "Application database queries for the indexes module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private Status
  "Lifecycle states for a table index request. Mirrors `metabase.indexes.schema/statuses`; duplicated here (rather
  than required) to keep this namespace free of module-internal logic dependencies."
  [:enum :create-pending :update-pending :delete-pending :running :succeeded :failed])

(mu/defn synced-table-indexes-clause :- [:fn vector?]
  "The clause over the TableIndex table aliased `alias` selecting the indexes of the transforms remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (remote-sync/synced-fk-clause alias :transform_id :model/Transform opts))

(mu/defn table-indexes-for-transform
  "The TableIndexes of the Transform with `transform-id`, in id order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex :transform_id transform-id {:order-by [[:id :asc]]}))

(mu/defn applicable-table-indexes-for-transform
  "The TableIndexes of the Transform with `transform-id` that are not pending deletion, in name order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status [:not= :delete-pending]
             {:order-by [[:index_name :asc]]}))

(mu/defn applicable-table-index-statuses-for-transforms
  "The id, status and error message of each of the TableIndexes of the Transforms with `transform-ids` that are not
  pending deletion."
  [transform-ids :- [:sequential {:min 1} ::lib.schema.id/transform]]
  (app-db/select-batched #(t2/select [:model/TableIndex :id :status :error_message]
                                     :transform_id [:in %]
                                     :status [:not= :delete-pending])
                         transform-ids))

(mu/defn running-table-indexes
  "The running TableIndexes among `ids` of the Transform with `transform-id`, in id order."
  [transform-id :- ::lib.schema.id/transform
   ids          :- [:sequential ms/PositiveInt]]
  (vec (sort-by :id (app-db/select-batched #(t2/select :model/TableIndex
                                                       :transform_id transform-id
                                                       :id [:in %]
                                                       :status :running
                                                       {:order-by [[:id :asc]]})
                                           ids))))

(mu/defn delete-pending-table-indexes
  "The TableIndexes of the Transform with `transform-id` that are pending deletion, in id order."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status :delete-pending
             {:order-by [[:id :asc]]}))

(mu/defn applicable-table-index
  "The TableIndex with `id` if it is not pending deletion, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TableIndex :id id :status [:not= :delete-pending]))

(mu/defn table-index-with-status-exists?
  "Whether the Transform with `transform-id` has a TableIndex in one of `statuses`."
  [transform-id :- ::lib.schema.id/transform
   statuses     :- [:set Status]]
  (t2/exists? :model/TableIndex :transform_id transform-id :status [:in statuses]))

(def ^:private StatusChanges
  "The columns a status change of a TableIndex sets."
  [:map {:closed true}
   [:status           {:optional true} [:maybe [:or :keyword :string]]]
   [:error_message    {:optional true} [:maybe :string]]
   [:last_executed_at {:optional true} [:= :%now]]])

(mu/defn table-index-statuses
  "The id, status and error message of each of the TableIndexes with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/select-batched #(t2/select [:model/TableIndex :id :status :error_message] :id [:in %]) ids))

(defn- update-by-changes!
  "Apply `changes` to the TableIndexes of `rows` with one plain update through the model per partition, `where`
  narrowing it."
  [rows changes where]
  (when (seq rows)
    (app-db/sum-batched app-db/update-partition-size #(t2/update! :model/TableIndex (into {:id [:in (mapv :id %)]} where) changes) rows)))

(mu/defn mark-table-indexes-running!
  "Apply `changes` to the TableIndexes of `rows`, as stored, whose status is in `from-statuses`."
  [rows          :- [:sequential :map]
   from-statuses :- [:set Status]
   changes       :- StatusChanges]
  (update-by-changes! rows changes {:status [:in from-statuses]}))

(mu/defn mark-running-table-indexes-failed!
  "Apply `changes` to the running TableIndexes of `rows`, as stored."
  [rows    :- [:sequential :map]
   changes :- StatusChanges]
  (update-by-changes! rows changes {:status :running}))

(mu/defn update-table-index-statuses!
  "Apply `changes` to the TableIndexes of `rows`, as stored."
  [rows    :- [:sequential :map]
   changes :- StatusChanges]
  (update-by-changes! rows changes nil))

(mu/defn table-index-exists-for-transform?
  "Whether the Transform with `transform-id` has a TableIndex named `index-name`."
  [transform-id :- ::lib.schema.id/transform
   index-name   :- :string]
  (t2/exists? :model/TableIndex :transform_id transform-id :index_name index-name))

(mu/defn mark-table-index-failed!
  "Mark the TableIndex named `index-name` of the Transform with `transform-id` failed with `error-message`."
  [transform-id  :- ::lib.schema.id/transform
   index-name    :- :string
   error-message :- :string]
  (t2/update! :model/TableIndex
              :transform_id transform-id :index_name index-name
              {:status :failed :error_message error-message :last_executed_at :%now}))
