(ns metabase.revisions.db
  "Application database queries for the revisions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.id :as lib.schema.id]
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
  (if (seq ids)
    (t2/select model :id [:in ids])
    []))

(mu/defn raw-row
  "The `model` row with `id` read straight from its table, or nil. See [[entity]] for why `model` is generic."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one (t2/table-name model) :id id))

(def revisioned-model-row-schema
  "The literal registry keyword of the row/update schema of each model revisions are tracked for (a literal
  keyword, not a `require`, to avoid a dependency cycle with the module that owns each model)."
  {:model/Card        :metabase.queries.schema/card
   :model/Dashboard   :metabase.dashboards.schema/dashboard.update
   :model/Document    :metabase.documents.schema/document.update
   :model/Exploration :metabase.explorations.schema/exploration.update
   :model/Measure     :metabase.measures.schema/measure.update
   :model/Segment     :metabase.segments.schema/segment.update
   :model/Transform   :metabase.transforms.schema/transform.update})

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
  (t2/update! (:model entity) :id id (:row entity)))

(mu/defn parameter-card-ids
  "The Card ids of the ParameterCards of the `parameterized-object-type` with `parameterized-object-id`."
  [parameterized-object-type :- :string
   parameterized-object-id   :- ms/PositiveInt]
  (t2/select-fn-vec :card_id :model/ParameterCard
                    :parameterized_object_type parameterized-object-type
                    :parameterized_object_id   parameterized-object-id))

(mu/defn parent-ids
  "The ids that the `parent-key` column of the `model` rows with `ids` holds, by id."
  [model      :- :keyword
   parent-key :- :keyword
   ids        :- [:sequential ms/PositiveInt]]
  (if (seq ids)
    (into {} (t2/select-fn-vec (juxt :id parent-key) [model :id parent-key] :id [:in ids]))
    {}))

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

(mu/defn cards-by-ids
  "The Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (if (seq card-ids)
    (t2/select :model/Card :id [:in card-ids])
    []))

(mu/defn collections-by-ids
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (if (seq collection-ids)
    (t2/select :model/Collection :id [:in collection-ids])
    []))

(mu/defn dashboards-by-ids
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (if (seq dashboard-ids)
    (t2/select :model/Dashboard :id [:in dashboard-ids])
    []))

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
  (t2/update! :model/Revision
              :id [:in ^:allow-subquery
                   {:select [:superseded.id]
                    :from   [[^:allow-subquery {:select [:r.id]
                                                :from   [[:revision :r]]
                                                :where  [:and
                                                         [:= :r.most_recent true]
                                                         (entities-clause :r entities)
                                                         (newer-revision-exists :r)]}
                              :superseded]]}]
              {:most_recent false}))

(mu/defn delete-revisions-beyond!
  "Delete the Revisions of `entities` that `kept` newer Revisions of the same row follow, returning the number
  deleted."
  [entities :- [:sequential Entity]
   kept     :- ms/PositiveInt]
  (t2/delete! :model/Revision
              :id [:in ^:allow-subquery
                   {:select [:old.id]
                    :from   [[^:allow-subquery {:select [:r.id]
                                                :from   [[:revision :r]]
                                                :where  [:and
                                                         (entities-clause :r entities)
                                                         [:<= kept ^:allow-subquery
                                                          {:select [:%count.*]
                                                           :from   [[:revision :newer]]
                                                           :where  [:and
                                                                    [:= :newer.model :r.model]
                                                                    [:= :newer.model_id :r.model_id]
                                                                    [:> :newer.id :r.id]]}]]}
                              :old]]}]))

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

(def ^:private revision-object-extra-keys
  "Extra keys the `:children` of the Dashboard revision spec add to some models' revision
  `:object` beyond their own row schema."
  {:model/Dashboard [[:cards {:optional true} [:sequential [:merge :metabase.dashboards.schema/dashboard-card.update
                                                            [:map {:closed true}
                                                             [:id     {:optional true} ::lib.schema.id/dashcard]
                                                             [:series {:optional true} [:sequential ::lib.schema.id/card]]]]]]
                     [:tabs  {:optional true} [:sequential [:merge :metabase.dashboards.schema/dashboard-tab.update
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
  [:map {:closed false}])

(mr/def ::stored-revision-object
  "A revision `:object` as stored, whose keys the Metabase version that recorded it owns (fields may since have been dropped)."
  [:map {:closed false}])

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

(mu/defn insert-revisions!
  "Insert the Revision `rows` in one statement, returning the number inserted."
  [rows :- [:sequential RevisionRow]]
  (t2/insert! :model/Revision rows))

(mu/defn insert-revision-returning!
  "Insert the Revision `row` and return the inserted instance."
  [row :- RevertedRevisionRow]
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
                [:= :r.model db-model]
                [:in :r.model_id ids]
                (revisions.sql/newest-revision-clause :r db-model :r.model_id)]}))

(mu/defn latest-changes
  "The editing User, model, model id, and timestamp of the most recent Revisions of the Cards with `card-ids`
  and/or the Dashboards with `dashboard-ids`."
  [card-ids      :- [:maybe [:sequential ::lib.schema.id/card]]
   dashboard-ids :- [:maybe [:sequential ::lib.schema.id/dashboard]]]
  (t2/query {:select    [:u.id :u.email :u.first_name :u.last_name
                         :r.model :r.model_id :r.timestamp]
             :from      [[:revision :r]]
             :left-join [[:core_user :u] [:= :u.id :r.user_id]]
             :where     (into [:or]
                              (keep (fn [[model-name ids]]
                                      (when (seq ids)
                                        [:and
                                         [:= :r.model model-name]
                                         [:in :r.model_id ids]
                                         (revisions.sql/newest-revision-clause :r model-name :r.model_id)])))
                              [["Card" card-ids] ["Dashboard" dashboard-ids]])}))
