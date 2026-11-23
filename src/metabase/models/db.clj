(ns metabase.models.db
  "Application database queries for the models module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (the model machinery still uses
  `toucan2.core`)."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.identity-query :as t2.identity-query]))

(mu/defn entity-by-pk
  "The `model` row whose `pk-column` is `id`, or nil."
  [model     :- [:or :keyword symbol?]
   pk-column :- :keyword
   id        :- [:or :int :string]]
  (t2/select-one model pk-column id))

(mr/def ::after-select-row
  "A row not yet run through its model's after-select, e.g. a stored revision snapshot whose keys older Metabase versions own."
  [:map {:closed false, :description "shape depends on the model, hydration state, and revision history"}])

(def ^:private AfterSelectEntity
  "A `{:model ..., :row ...}` pair naming any model, test-only ones derived from `:metabase/model` included, and a row
  of any shape to run through its after-select machinery."
  [:map {:closed true}
   [:model [:or :keyword symbol?]]
   [:row ::after-select-row]])

(mu/defn after-select-via-identity-query
  "`entity`'s `:row` run through the after-select machinery of `entity`'s `:model`."
  [entity :- AfterSelectEntity]
  (t2/select-one (:model entity) (t2.identity-query/identity-query [(:row entity)])))

(mu/defn database-name
  "The name of the Database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one-fn :name [:model/Database :id :name] :id database-id))

(mu/defn timeline-ids-of-events
  "The distinct Timeline ids of the TimelineEvents with `event-ids`."
  [event-ids :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :timeline_id [:model/TimelineEvent :timeline_id] :id [:in event-ids]))
