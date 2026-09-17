(ns metabase.revisions.db
  "Application database queries for the revisions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the revisions-only section at the bottom
  of this namespace."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.revisions.schema :as revisions.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which Revisions a query applies to. Keys mirror the columns of `revision`: a scalar matches that value and a set
  matches any of its values."
  [:map {:closed true}
   [:id       {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:model    {:optional true} :string]
   [:model_id {:optional true} ms/PositiveInt]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::revisions.schema/revision.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::revisions.schema/revision.column
                                              [:tuple ::revisions.schema/revision.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/Revision columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-revisions :- [:sequential ::revisions.schema/revision.partial]
  "The Revisions matching `opts`."
  ([]
   (select-revisions nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-revision :- [:maybe ::revisions.schema/revision.partial]
  "The first Revision matching `opts`, or nil."
  ([]
   (select-one-revision nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn delete-revisions! :- :int
  "Delete every Revision matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/Revision (->args opts)))

;;; ------------------------------- Queries used only by the revisions module -------------------------------

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

(def revisioned-model-row-schema
  "The literal registry keyword of the row/update schema of each model revisions are tracked for (a literal
  keyword, not a `require`, to avoid a dependency cycle with the module that owns each model)."
  {:model/Card        :metabase.queries.schema/card.columns
   :model/Dashboard   :metabase.dashboards.schema/dashboard.columns
   :model/Document    :metabase.documents.schema/document.columns
   :model/Exploration :metabase.explorations.schema/exploration.update
   :model/Measure     :metabase.measures.schema/measure.update
   :model/Segment     :metabase.segments.schema/segment.update
   :model/Transform   :metabase.transforms.schema/transform.columns})

(defn- revision-schema-key [prefix model]
  (keyword "metabase.revisions.db" (str prefix "." (name model))))

(doseq [[model schema] revisioned-model-row-schema]
  (mr/register! (revision-schema-key "revisioned-row" model)
                [:map {:closed true}
                 [:model [:= model]]
                 [:row [:merge schema [:map {:closed true} [:id {:optional true} ms/PositiveInt]]]]]))

(def ^:private RevisionedRow
  "A `{:model ..., :row ...}` pair naming one of the models revisions are tracked for, the row typed by that
  model's own row schema plus `:id` (a revisioned row is always a real, previously-selected row)."
  (into [:multi {:dispatch :model, :lazy-refs true}]
        (for [model (keys revisioned-model-row-schema)]
          [model (revision-schema-key "revisioned-row" model)])))

(mu/defn update-entity!
  "Apply `entity`'s `:row` (a column diff) to `entity`'s `:model` row with `id`, returning the number updated."
  [id     :- ms/PositiveInt
   entity :- RevisionedRow]
  (t2/update! (:model entity) id (:row entity)))

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

(def ^:private revision-object-extra-keys
  "Extra keys [[metabase.revisions.impl.dashboard/serialize-instance]] and friends add to some models' revision
  `:object` beyond their own row schema."
  {:model/Dashboard [[:cards {:optional true} [:sequential [:merge :metabase.dashboards.schema/dashboard-card.columns
                                                            [:map {:closed true}
                                                             [:id     {:optional true} ::lib.schema.id/dashcard]
                                                             [:series {:optional true} [:sequential ::lib.schema.id/card]]]]]]
                     [:tabs  {:optional true} [:sequential [:merge :metabase.dashboards.schema/dashboard-tab.columns
                                                            [:map {:closed true} [:id {:optional true} ms/PositiveInt]]]]]]})

(def revisioned-model-select-schema
  "The literal registry keyword of the row schema (as selected, hydrated keys included) of each model revisions are
  tracked for."
  {:model/Card        :metabase.queries.schema/card
   :model/Dashboard   :metabase.dashboards.schema/dashboard
   :model/Document    :metabase.documents.schema/document
   :model/Exploration :metabase.explorations.schema/exploration
   :model/Measure     :metabase.measures.schema/measure
   :model/Segment     :metabase.segments.schema/segment
   :model/Transform   :metabase.transforms.schema/transform})

(mr/def ::unregistered-model-object
  "The revision `:object` of a model outside [[revisioned-model-row-schema]] (a test double), whose keys that model's own `serialize-instance` owns."
  [:map {:closed false, ::mr/deliberately-open true}])

(mr/def ::stored-revision-object
  "A revision `:object` as stored, whose keys the Metabase version that recorded it owns (fields may since have been dropped)."
  [:map {:closed false, ::mr/deliberately-open true}])

(doseq [[model schema] revisioned-model-select-schema]
  (mr/register! (revision-schema-key "revision-row" model)
                [:map {:closed true}
                 [:model        [:= (name model)]]
                 [:model_id     ms/PositiveInt]
                 [:user_id      ::lib.schema.id/user]
                 [:object       [:merge schema
                                 (into [:map {:closed true} [:id {:optional true} ms/PositiveInt]]
                                       (get revision-object-extra-keys model))]]
                 [:is_creation  :boolean]
                 [:is_reversion :boolean]
                 [:message      {:optional true} [:maybe :string]]]))

(def ^:private RevisionRow
  "A Revision row, `:object` typed by the row schema of the model named `:model` (a string, e.g. \"Card\"), plus
  `:id` (a revisioned object is always a real, previously-selected row)."
  (conj (into [:multi {:dispatch :model, :lazy-refs true}]
              (map (fn [model] [(name model) (revision-schema-key "revision-row" model)]))
              (keys revisioned-model-row-schema))
        [::mc/default [:map {:closed true}
                       [:model        :string]
                       [:model_id     ms/PositiveInt]
                       [:user_id      ::lib.schema.id/user]
                       [:object       ::unregistered-model-object]
                       [:is_creation  :boolean]
                       [:is_reversion :boolean]
                       [:message      {:optional true} [:maybe :string]]]]))

(def ^:private RevertedRevisionRow
  "A Revision row recording a revert to the stored `:object` of an earlier Revision."
  [:map {:closed true}
   [:model        :string]
   [:model_id     ms/PositiveInt]
   [:user_id      ::lib.schema.id/user]
   [:object       ::stored-revision-object]
   [:is_creation  :boolean]
   [:is_reversion :boolean]
   [:message      {:optional true} [:maybe :string]]])

(mu/defn insert-revision!
  "Insert the Revision `row`, returning the number inserted."
  [row :- RevisionRow]
  (t2/insert! :model/Revision row))

(mu/defn insert-revision-returning!
  "Insert the Revision `row` and return the inserted instance."
  [row :- RevertedRevisionRow]
  (t2/insert-returning-instance! :model/Revision row))

(mu/defn reducible-select-latest-editors
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

(mu/defn select-latest-changes
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
