(ns metabase.revisions.db
  "Application database queries for the revisions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn entity
  "The `model` row with `id`, or nil."
  [model id]
  (t2/select-one model :id id))

(defn raw-row
  "The `model` row with `id` read straight from its table, or nil."
  [model id]
  (t2/select-one (t2/table-name model) :id id))

(defn update-entity!
  "Apply `changes` to the `model` row with `id`."
  [model id changes]
  (t2/update! model id changes))

(defn parameter-card-ids
  "The Card ids of the ParameterCards of the `parameterized-object-type` with `parameterized-object-id`."
  [parameterized-object-type parameterized-object-id]
  (t2/select-fn-vec :card_id :model/ParameterCard
                    :parameterized_object_type parameterized-object-type
                    :parameterized_object_id   parameterized-object-id))

(defn dashboard-card-ids
  "The Card ids of the DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id dashboard-id))

(defn dashboard-series-card-ids
  "The Card ids of the DashboardCardSeries of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-fn-vec :card_id :model/DashboardCardSeries
                    {:where [:in :dashboardcard_id
                             ^:allow-subquery {:select [:id]
                                               :from   [(t2/table-name :model/DashboardCard)]
                                               :where  [:= :dashboard_id dashboard-id]}]}))

(defn card-queries
  "A map of Card id to query for the Cards with `card-ids`."
  [card-ids]
  (t2/select-pk->fn :dataset_query :model/Card :id [:in card-ids]))

(defn revision
  "The Revision with `revision-id` of the `model-name` row with `model-id`, or nil."
  [model-name model-id revision-id]
  (t2/select-one :model/Revision :model model-name, :model_id model-id, :id revision-id))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn hydrate-moderation-reviews-with-moderator
  "Hydrate `:moderation_reviews` with their moderator details onto `card`."
  [card]
  (t2/hydrate card [:moderation_reviews :moderator_details]))

(defn hydrate-dashcards
  "Hydrate `:dashcards` onto `dashboard`."
  [dashboard]
  (t2/hydrate dashboard :dashcards))

(defn hydrate-series
  "Hydrate `:series` onto `dashcards`."
  [dashcards]
  (t2/hydrate dashcards :series))

(defn hydrate-tabs
  "Hydrate `:tabs` onto `dashboard`."
  [dashboard]
  (t2/hydrate dashboard :tabs))

(defn hydrate-user
  "Hydrate `:user` onto `revision`."
  [revision]
  (t2/hydrate revision :user))

(defn dashcards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(defn dashboard-tabs
  "The DashboardTabs of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id))

(defn active-card-ids-for-dashboard
  "The ids among `card-ids` of unarchived Cards that belong to the Dashboard with `dashboard-id` or to no Dashboard."
  [card-ids dashboard-id]
  (t2/select-pks-set :model/Card
                     {:where [:and
                              [:in :id card-ids]
                              [:= :archived false]
                              [:or
                               [:= :dashboard_id dashboard-id]
                               [:= :dashboard_id nil]]]}))

(defn active-card-ids
  "The ids among `card-ids` of unarchived Cards."
  [card-ids]
  (t2/select-pks-set :model/Card {:where [:and [:in :id card-ids] [:= :archived false]]}))

(defn lock-revisions!
  "Lock the Revisions of the `model-name` row with `model-id` for update."
  [model-name model-id]
  (t2/query {:select [:id]
             :from [:revision]
             :where [:and
                     [:= :model model-name]
                     [:= :model_id model-id]]
             :for :update}))

(defn revision-ids-newest-first
  "The ids of the Revisions of the `model-name` row with `model-id`, newest first."
  [model-name model-id]
  (t2/select-fn-vec :id :model/Revision
                    :model    model-name
                    :model_id model-id
                    {:order-by [[:timestamp :desc]
                                [:id :desc]]}))

(defn delete-revisions!
  "Delete the Revisions with `ids`."
  [ids]
  (t2/delete! :model/Revision :id [:in ids]))

(defn unmark-most-recent-revisions!
  "Clear `most_recent` on the Revisions of the `model-name` row with `model-id` other than `revision-id`."
  [model-name model-id revision-id]
  ;; updates the table directly: revisions are otherwise immutable
  (t2/update! (t2/table-name :model/Revision)
              {:model model-name :model_id model-id :most_recent true :id [:not= revision-id]}
              {:most_recent false}))

(defn revisions
  "The Revisions of the `model-name` row with `model-id`, newest first."
  [model-name model-id]
  (t2/select :model/Revision :model model-name :model_id model-id {:order-by [[:id :desc]]}))

(defn latest-revision
  "The newest Revision of the `model-name` row with `model-id`, or nil."
  [model-name model-id]
  (t2/select-one :model/Revision :model model-name, :model_id model-id, {:order-by [[:id :desc]]}))

(defn latest-revision-object
  "The serialized object of the newest Revision of the `model-name` row with `model-id`, or nil."
  [model-name model-id]
  (t2/select-one-fn :object :model/Revision :model model-name :model_id model-id {:order-by [[:id :desc]]}))

(defn revision-object
  "The serialized object of the Revision with `revision-id` of the `model-name` row with `model-id`, or nil."
  [model-name model-id revision-id]
  (t2/select-one-fn :object :model/Revision :model model-name :model_id model-id :id revision-id))

(defn insert-revision!
  "Insert the Revision `row`."
  [row]
  (t2/insert! :model/Revision row))

(defn insert-revision-returning!
  "Insert the Revision `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Revision row))

(defn latest-editors-reducible
  "A reducible of the model id, editing User, and timestamp of the most recent Revisions of the `db-model` rows with
  `ids`."
  [db-model ids]
  (t2/reducible-query
   {:select    [:r.model_id :u.id :u.email :u.first_name :u.last_name :r.timestamp]
    :from      [[:revision :r]]
    :left-join [[:core_user :u] [:= :u.id :r.user_id]]
    :where     [:and
                [:= :r.most_recent true]
                [:= :r.model db-model]
                [:in :r.model_id ids]]}))

(defn latest-changes
  "The editing User, model, model id, and timestamp of the most recent Revisions matching the Honey SQL
  `model-clause`."
  [model-clause]
  (t2/query {:select    [:u.id :u.email :u.first_name :u.last_name
                         :r.model :r.model_id :r.timestamp]
             :from      [[:revision :r]]
             :left-join [[:core_user :u] [:= :u.id :r.user_id]]
             :where     [:and [:= :r.most_recent true] model-clause]}))
