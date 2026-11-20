(ns metabase-enterprise.replacement.db
  "Application database queries for the replacement module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- side-join
  "The left join of the Card and the Transform at `side` (`:source` or `:target`) of each ReplacementRun."
  [side]
  (let [entity-type (keyword (str "run." (name side) "_entity_type"))
        entity-id   (keyword (str "run." (name side) "_entity_id"))
        card        (keyword (str (name side) "_card"))
        transform   (keyword (str (name side) "_transform"))]
    [[(t2/table-name :model/Card) card]
     [:and [:= entity-type "card"] [:= (u/qualified-key card :id) entity-id]]
     [(t2/table-name :model/Transform) transform]
     [:and [:= entity-type "transform"] [:= (u/qualified-key transform :id) entity-id]]]))

(defn- existing-side-clause
  "Matches the ReplacementRuns whose Card or Transform at `side` exists, or whose entity there is a Table, with
  [[side-join]]."
  [side]
  [:or
   [:= (keyword (str "run." (name side) "_entity_type")) "table"]
   [:not= (u/qualified-key (keyword (str (name side) "_card")) :id) nil]
   [:not= (u/qualified-key (keyword (str (name side) "_transform")) :id) nil]])

(defn- existing-runs-query
  "The query of the ReplacementRuns whose source and target exist, aliased `run`."
  []
  {:select    [:run.*]
   :from      [[(t2/table-name :model/ReplacementRun) :run]]
   :left-join (into (side-join :source) (side-join :target))
   :where     [:and (existing-side-clause :source) (existing-side-clause :target)]})

(mu/defn run
  "The ReplacementRun with `run-id` whose source and target exist, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one :model/ReplacementRun (update (existing-runs-query) :where conj [:= :run.id run-id])))

(mu/defn runs
  "The ReplacementRuns whose source and target exist, newest first, restricted to the `is-active` flag when given."
  [is-active :- [:maybe :boolean]]
  (t2/select :model/ReplacementRun
             (cond-> (assoc (existing-runs-query) :order-by [[:run.start_time :desc]])
               (some? is-active) (update :where conj [:= :run.is_active is-active]))))

(mu/defn active-run
  "The active ReplacementRun, or nil."
  []
  (t2/select-one :model/ReplacementRun :is_active true))

(mu/defn run-active-flag
  "The `:is_active` row of the ReplacementRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one [:model/ReplacementRun :is_active] :id run-id))

(mu/defn insert-run!
  "Insert `run` and return the new instance."
  [run :- ::replacement.schema/replacement-run.update]
  (t2/insert-returning-instance! :model/ReplacementRun run))

(mu/defn update-run!
  "Apply `changes` to the ReplacementRun with `run-id`, returning the number updated."
  [run-id  :- ms/PositiveInt
   changes :- ::replacement.schema/replacement-run.update]
  (t2/update! :model/ReplacementRun :id run-id changes))

(mu/defn update-active-run!
  "Apply `changes` to the ReplacementRun with `run-id` if it is active, returning the number updated."
  [run-id  :- ms/PositiveInt
   changes :- ::replacement.schema/replacement-run.update]
  (t2/update! :model/ReplacementRun :id run-id :is_active true changes))

(mu/defn time-out-active-runs-older-than!
  "Mark the active ReplacementRuns started more than `age` `unit`s ago as timed out, returning the number updated."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (t2/update! :model/ReplacementRun
              :is_active true
              :start_time [:< (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]
              {:status    :timeout
               :is_active nil
               :end_time  :%now
               :message   "Timed out by metabase"}))

(mu/defn row
  "The row of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one model :id id))

(mu/defn rows
  "The rows of `model` with `ids`."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select model :id [:in ids]))

(mu/defn update-row!
  "Apply `changes` to the row of `model` with `id`, returning the number updated."
  [model   :- :keyword
   id      :- ms/PositiveInt
   changes :- :map]
  (t2/update! model :id id changes))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-with-table-exists?
  "Whether one of the Cards with `card-ids` is on the Table with `table-id`."
  [card-ids :- [:set ::lib.schema.id/card]
   table-id :- ::lib.schema.id/table]
  (t2/exists? :model/Card :id [:in card-ids] :table_id table-id))

(mu/defn update-card!
  "Apply `changes` to the Card with `card-id`, returning the number updated."
  [card-id :- ::lib.schema.id/card
   changes :- ::queries.schema/card.update]
  (t2/update! :model/Card :id card-id changes))

(mu/defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn active-fields-of-table
  "The active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field :table_id table-id :active true))

(mu/defn active-field-ids-of-table
  "The IDs of the active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id :active true))

(mu/defn active-fk-to-fields-exists?
  "Whether an active Field on an active Table points at one of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/exists? :model/Field {:from  [(t2/table-name :model/Field)]
                            :join  [(t2/table-name :model/Table)
                                    [:= :metabase_field.table_id :metabase_table.id]]
                            :where [:and
                                    [:in :metabase_field.fk_target_field_id field-ids]
                                    [:= :metabase_field.active true]
                                    [:= :metabase_table.active true]]}))

(mu/defn sandbox-exists-for-table?
  "Whether a Sandbox is defined on the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/exists? :model/Sandbox :table_id table-id))

(mu/defn sandbox-card-ids
  "The IDs of the Cards Sandboxes are built on."
  []
  (t2/select-fn-set :card_id :model/Sandbox :card_id [:not= nil]))

(mu/defn persisted-info-for-card
  "The PersistedInfo of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/PersistedInfo :card_id card-id))
