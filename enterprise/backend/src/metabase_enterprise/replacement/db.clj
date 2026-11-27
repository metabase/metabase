(ns metabase-enterprise.replacement.db
  "Application database queries for the replacement module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn run
  "The ReplacementRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one :model/ReplacementRun :id run-id))

(mu/defn runs
  "The ReplacementRuns, newest first, restricted to the `is-active` flag when given."
  [is-active :- [:maybe :boolean]]
  (t2/select :model/ReplacementRun
             (cond-> {:order-by [[:start_time :desc]]}
               (some? is-active) (assoc :where [:= :is_active is-active]))))

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
              :start_time [:< [:date-add [:now] (- age) unit]]
              {:status    :timeout
               :is_active nil
               :end_time  [:now]
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
  (mdb/select-batched #(t2/select model :id [:in %]) ids))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-with-table-exists?
  "Whether one of the Cards with `card-ids` is on the Table with `table-id`."
  [card-ids :- [:set ::lib.schema.id/card]
   table-id :- ::lib.schema.id/table]
  (boolean (some #(t2/exists? :model/Card :id [:in %] :table_id table-id)
                 (mdb/select-partitions card-ids))))

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
  (boolean (some #(t2/exists? :model/Field {:from  [(t2/table-name :model/Field)]
                                            :join  [(t2/table-name :model/Table)
                                                    [:= (u/qualified-key (t2/table-name :model/Field) :table_id) (u/qualified-key (t2/table-name :model/Table) :id)]]
                                            :where [:and
                                                    [:in (u/qualified-key (t2/table-name :model/Field) :fk_target_field_id) %]
                                                    [:= (u/qualified-key (t2/table-name :model/Field) :active) true]
                                                    [:= (u/qualified-key (t2/table-name :model/Table) :active) true]]})
                 (mdb/select-partitions field-ids))))

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
