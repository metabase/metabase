(ns metabase.revisions.db
  "Application database queries for the revisions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.revisions.schema :as revisions.schema]
   [metabase.revisions.sql :as revisions.sql]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn entity
  "The `model` row with `id`, or nil. `model` is a generic `:model/X` keyword — revisions track many kinds of
  entities (Card, Dashboard, Segment, ...) — so the returned row can't be tied to a single Instance schema."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one model :id id))

(mu/defn entities-by-ids
  "The `model` rows with `ids`. See [[entity]] for why `model` is generic."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select model :id [:in %]) ids))

(mu/defn parameter-card-ids
  "The Card ids of the ParameterCards of the `parameterized-object-type` with `parameterized-object-id`."
  [parameterized-object-type :- :string
   parameterized-object-id   :- ms/PositiveInt]
  (t2/select-fn-vec :card_id :model/ParameterCard
                    :parameterized_object_type parameterized-object-type
                    :parameterized_object_id   parameterized-object-id))

(mu/defn dashboard-card-ids
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashboard-series-card-ids
  "The Card ids of the DashboardCardSeries of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-fn-vec :card_id :model/DashboardCardSeries
                    {:where [:in :dashboardcard_id
                             ^:allow-subquery {:select [:id]
                                               :from   [(t2/table-name :model/DashboardCard)]
                                               :where  [:= :dashboard_id dashboard-id]}]}))

(mu/defn card-queries
  "A map of Card id to query for the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn :dataset_query :model/Card :id [:in %]) card-ids))

(mu/defn revision
  "The Revision with `revision-id` of the `model-name` row with `model-id`, or nil."
  [model-name  :- :string
   model-id    :- ms/PositiveInt
   revision-id :- ms/PositiveInt]
  (t2/select-one :model/Revision :model model-name, :model_id model-id, :id revision-id))

(mu/defn cards-by-ids
  "The Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select :model/Card :id [:in %]) card-ids))

(mu/defn collections-by-ids
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (mdb/select-batched #(t2/select :model/Collection :id [:in %]) collection-ids))

(mu/defn dashboards-by-ids
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (mdb/select-batched #(t2/select :model/Dashboard :id [:in %]) dashboard-ids))

(def ^:private Entity
  "A revisioned row, as its `[model-name model-id]`."
  [:tuple :string ms/PositiveInt])

(defn- entities-clause
  "The where-clause matching the Revisions of `entities` under the table alias `alias`."
  [alias entities]
  (let [column #(keyword (str (name alias) "." (name %)))]
    (into [:or]
          (for [[model-name model-id] entities]
            [:and [:= (column :model) model-name] [:= (column :model_id) model-id]]))))

(defn- newer-revision-exists
  "The where-clause true when a Revision of the same row is newer than the Revision under the alias `alias`."
  [alias]
  (let [column #(keyword (str (name alias) "." (name %)))]
    [:exists ^:allow-subquery {:select [1]
                               :from   [[:revision :newer]]
                               :where  [:and
                                        [:= :newer.model (column :model)]
                                        [:= :newer.model_id (column :model_id)]
                                        [:> :newer.id (column :id)]]}]))

(mu/defn unmark-superseded-revisions!
  "Clear `most_recent` on the Revisions of `entities` that a newer Revision of the same row supersedes, returning the
  number updated."
  [entities :- [:sequential Entity]]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/Revision
                                                          :id [:in ^:allow-subquery
                                                               {:select [:superseded.id]
                                                                :from   [[^:allow-subquery {:select [:r.id]
                                                                                            :from   [[:revision :r]]
                                                                                            :where  [:and
                                                                                                     [:= :r.most_recent true]
                                                                                                     (entities-clause :r %)
                                                                                                     (newer-revision-exists :r)]}
                                                                          :superseded]]}]
                                                          {:most_recent false}) entities))

(mu/defn delete-revisions-beyond!
  "Delete the Revisions of `entities` that `kept` newer Revisions of the same row follow, returning the number
  deleted."
  [entities :- [:sequential Entity]
   kept     :- ms/PositiveInt]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/Revision
                                                          :id [:in ^:allow-subquery
                                                               {:select [:old.id]
                                                                :from   [[^:allow-subquery {:select [:r.id]
                                                                                            :from   [[:revision :r]]
                                                                                            :where  [:and
                                                                                                     (entities-clause :r %)
                                                                                                     [:<= kept ^:allow-subquery
                                                                                                      {:select [:%count.*]
                                                                                                       :from   [[:revision :newer]]
                                                                                                       :where  [:and
                                                                                                                [:= :newer.model :r.model]
                                                                                                                [:= :newer.model_id :r.model_id]
                                                                                                                [:> :newer.id :r.id]]}]]}
                                                                          :old]]}]) entities))

(mu/defn revisions
  "The Revisions of the `model-name` row with `model-id`, newest first."
  [model-name :- :string
   model-id   :- ms/PositiveInt]
  (t2/select :model/Revision :model model-name :model_id model-id {:order-by [[:id :desc]]}))

(mu/defn latest-revision
  "The newest Revision of the `model-name` row with `model-id`, or nil."
  [model-name :- :string
   model-id   :- ms/PositiveInt]
  (t2/select-one :model/Revision :model model-name, :model_id model-id, {:order-by [[:id :desc]], :limit 1}))

(mu/defn latest-revision-object
  "The serialized object of the newest Revision of the `model-name` row with `model-id`, or nil."
  [model-name :- :string
   model-id   :- ms/PositiveInt]
  (t2/select-one-fn :object :model/Revision :model model-name :model_id model-id {:order-by [[:id :desc]], :limit 1}))

(mu/defn revision-object
  "The serialized object of the Revision with `revision-id` of the `model-name` row with `model-id`, or nil."
  [model-name  :- :string
   model-id    :- ms/PositiveInt
   revision-id :- ms/PositiveInt]
  (t2/select-one-fn :object :model/Revision :model model-name :model_id model-id :id revision-id))

(mr/def ::unregistered-model-object
  "The row of a revisioned model that a Revision is made of, whose keys that model's own spec owns."
  [:map {:closed false}])

(mu/defn insert-revisions!
  "Insert the Revision `rows` in one statement, returning the number inserted."
  [rows :- [:sequential ::revisions.schema/revision.create]]
  (t2/insert! :model/Revision rows))

(mu/defn latest-editors-reducible
  "A reducible of the model id, editing User, and timestamp of the most recent Revisions of the `db-model` rows with
  `ids`."
  [db-model :- :string
   ids      :- [:set ms/PositiveInt]]
  (mdb/select-batched-reducible #(t2/reducible-query
                                  {:select    [:r.model_id :u.id :u.email :u.first_name :u.last_name :r.timestamp]
                                   :from      [[:revision :r]]
                                   :left-join [[:core_user :u] [:= :u.id :r.user_id]]
                                   :where     [:and
                                               [:= :r.model db-model]
                                               [:in :r.model_id %]
                                               (revisions.sql/newest-revision-clause :r db-model :r.model_id)]}) ids))

(mu/defn latest-changes
  "The editing User, model, model id, and timestamp of the most recent Revisions of the Cards with `card-ids`
  and/or the Dashboards with `dashboard-ids`."
  [card-ids      :- [:maybe [:sequential ::lib.schema.id/card]]
   dashboard-ids :- [:maybe [:sequential ::lib.schema.id/dashboard]]]
  (mdb/select-batched (fn [model+ids]
                        (t2/query {:select    [:u.id :u.email :u.first_name :u.last_name
                                               :r.model :r.model_id :r.timestamp]
                                   :from      [[:revision :r]]
                                   :left-join [[:core_user :u] [:= :u.id :r.user_id]]
                                   :where     (into [:or]
                                                    (map (fn [[model-name pairs]]
                                                           [:and
                                                            [:= :r.model model-name]
                                                            [:in :r.model_id (mapv second pairs)]
                                                            (revisions.sql/newest-revision-clause :r model-name :r.model_id)]))
                                                    (group-by first model+ids))}))
                      (concat (map vector (repeat "Card") card-ids)
                              (map vector (repeat "Dashboard") dashboard-ids))))

(mu/defn delete-revisions-for-entities!
  "Delete the Revisions of the rows of the model named `model-name` with `model-ids`, returning the number deleted."
  [model-name :- :string
   model-ids  :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/Revision :model model-name :model_id [:in %]) model-ids))
