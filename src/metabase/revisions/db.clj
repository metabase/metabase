(ns metabase.revisions.db
  "Application database queries for the revisions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn entity
  "The `model` row with `id`, or nil. `model` is a generic `:model/X` keyword — revisions track many kinds of
  entities (Card, Dashboard, Segment, ...) — so the returned row can't be tied to a single Instance schema."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one model :id id))

(mu/defn raw-row
  "The `model` row with `id` read straight from its table, or nil. See [[entity]] for why `model` is generic."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one (t2/table-name model) :id id))

(mu/defn update-entity!
  "Apply `changes` to the `model` row with `id`, returning the number updated. `changes` is a generic map because
  `model` varies (see [[entity]]) and so its shape can't be pinned to one model's columns."
  [model   :- :keyword
   id      :- ms/PositiveInt
   changes :- :map]
  (t2/update! model id changes))

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
  (t2/select-pk->fn :dataset_query :model/Card :id [:in card-ids]))

(mu/defn revision
  "The Revision with `revision-id` of the `model-name` row with `model-id`, or nil."
  [model-name  :- :string
   model-id    :- ms/PositiveInt
   revision-id :- ms/PositiveInt]
  (t2/select-one :model/Revision :model model-name, :model_id model-id, :id revision-id))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn dashcards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn dashboard-tabs
  "The DashboardTabs of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id))

(mu/defn active-card-ids-for-dashboard
  "The ids among `card-ids` of unarchived Cards that belong to the Dashboard with `dashboard-id` or to no Dashboard."
  [card-ids     :- [:sequential ::lib.schema.id/card]
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-pks-set :model/Card
                     {:where [:and
                              [:in :id card-ids]
                              [:= :archived false]
                              [:or
                               [:= :dashboard_id dashboard-id]
                               [:= :dashboard_id nil]]]}))

(mu/defn active-card-ids
  "The ids among `card-ids` of unarchived Cards."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select-pks-set :model/Card {:where [:and [:in :id card-ids] [:= :archived false]]}))

(mu/defn lock-revisions!
  "Lock the Revisions of the `model-name` row with `model-id` for update."
  [model-name :- :string
   model-id   :- ms/PositiveInt]
  (t2/query {:select [:id]
             :from [:revision]
             :where [:and
                     [:= :model model-name]
                     [:= :model_id model-id]]
             :for :update}))

(mu/defn revision-ids-newest-first
  "The ids of the Revisions of the `model-name` row with `model-id`, newest first."
  [model-name :- :string
   model-id   :- ms/PositiveInt]
  (t2/select-fn-vec :id :model/Revision
                    :model    model-name
                    :model_id model-id
                    {:order-by [[:timestamp :desc]
                                [:id :desc]]}))

(mu/defn delete-revisions!
  "Delete the Revisions with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/Revision :id [:in ids]))

(mu/defn unmark-most-recent-revisions!
  "Clear `most_recent` on the Revisions of the `model-name` row with `model-id` other than `revision-id`, returning
  the number updated."
  [model-name  :- :string
   model-id    :- ms/PositiveInt
   revision-id :- ms/PositiveInt]
  ;; updates the table directly: revisions are otherwise immutable
  (t2/update! (t2/table-name :model/Revision)
              {:model model-name :model_id model-id :most_recent true :id [:not= revision-id]}
              {:most_recent false}))

(mu/defn revisions
  "The Revisions of the `model-name` row with `model-id`, newest first."
  [model-name :- :string
   model-id   :- ms/PositiveInt]
  (t2/select :model/Revision :model model-name :model_id model-id {:order-by [[:id :desc]]}))

(mu/defn latest-revision
  "The newest Revision of the `model-name` row with `model-id`, or nil."
  [model-name :- :string
   model-id   :- ms/PositiveInt]
  (t2/select-one :model/Revision :model model-name, :model_id model-id, {:order-by [[:id :desc]]}))

(mu/defn latest-revision-object
  "The serialized object of the newest Revision of the `model-name` row with `model-id`, or nil."
  [model-name :- :string
   model-id   :- ms/PositiveInt]
  (t2/select-one-fn :object :model/Revision :model model-name :model_id model-id {:order-by [[:id :desc]]}))

(mu/defn revision-object
  "The serialized object of the Revision with `revision-id` of the `model-name` row with `model-id`, or nil."
  [model-name  :- :string
   model-id    :- ms/PositiveInt
   revision-id :- ms/PositiveInt]
  (t2/select-one-fn :object :model/Revision :model model-name :model_id model-id :id revision-id))

(def ^:private RevisionRow
  [:map {:closed true}
   [:model        [:or :keyword :string]]
   [:model_id     ms/PositiveInt]
   [:user_id      ::lib.schema.id/user]
   [:object       :map]
   [:is_creation  :boolean]
   [:is_reversion :boolean]
   [:message      {:optional true} [:maybe :string]]])

(mu/defn insert-revision!
  "Insert the Revision `row`, returning the number inserted."
  [row :- RevisionRow]
  (t2/insert! :model/Revision row))

(mu/defn insert-revision-returning!
  "Insert the Revision `row` and return the inserted instance."
  [row :- RevisionRow]
  (t2/insert-returning-instance! :model/Revision row))

(mu/defn latest-editors-reducible
  "A reducible of the model id, editing User, and timestamp of the most recent Revisions of the `db-model` rows with
  `ids`."
  [db-model :- :string
   ids      :- [:set ms/PositiveInt]]
  (t2/reducible-query
   {:select    [:r.model_id :u.id :u.email :u.first_name :u.last_name :r.timestamp]
    :from      [[:revision :r]]
    :left-join [[:core_user :u] [:= :u.id :r.user_id]]
    :where     [:and
                [:= :r.most_recent true]
                [:= :r.model db-model]
                [:in :r.model_id ids]]}))

(mu/defn latest-changes
  "The editing User, model, model id, and timestamp of the most recent Revisions of the Cards with `card-ids`
  and/or the Dashboards with `dashboard-ids`."
  [card-ids      :- [:maybe [:sequential ::lib.schema.id/card]]
   dashboard-ids :- [:maybe [:sequential ::lib.schema.id/dashboard]]]
  (t2/query {:select    [:u.id :u.email :u.first_name :u.last_name
                         :r.model :r.model_id :r.timestamp]
             :from      [[:revision :r]]
             :left-join [[:core_user :u] [:= :u.id :r.user_id]]
             :where     [:and [:= :r.most_recent true]
                         (into [:or]
                               (keep (fn [[model-name ids]]
                                       (when (seq ids)
                                         [:and [:= :model model-name] [:in :model_id ids]])))
                               [["Card" card-ids] ["Dashboard" dashboard-ids]])]}))
