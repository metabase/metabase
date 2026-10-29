(ns metabase.revisions.db
  "Application database queries for the revisions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.revisions.schema :as revisions.schema]
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

(mu/defn raw-row
  "The `model` row with `id` read straight from its table, or nil. See [[entity]] for why `model` is generic."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one (t2/table-name model) :id id))

(def revisioned-model-row-schema
  "The literal registry keyword of the row/update schema of each model revisions are tracked for (a literal
  keyword, not a `require`, to avoid a dependency cycle with the module that owns each model)."
  {:model/Card        :metabase.queries.schema/card.update
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
  (t2/update! (:model entity) id (:row entity)))

(mu/defn revision :- [:maybe ::revisions.schema/revision]
  "The ::revisions.schema/revision with `revision-id`, or nil."
  [revision-id :- ms/PositiveInt]
  (t2/select-one :model/Revision :id [:auto/param revision-id]))

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

(def ^:private revision-object-extra-keys
  "Extra keys [[metabase.revisions.impl.dashboard/serialize-instance]] and friends add to some models' revision
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

(mu/defn dashboard-ids-edited-by-user
  "The set of ids of the Dashboards the User with `user-id` has revised."
  [{:keys [user-id]} :- [:map {:closed true}
                         [:user-id [:maybe ::lib.schema.id/user]]]]
  (t2/select-fn-set :model_id :model/Revision
                    :model     "Dashboard"
                    :user_id   user-id
                    {:order-by [[:timestamp :desc]]}))
