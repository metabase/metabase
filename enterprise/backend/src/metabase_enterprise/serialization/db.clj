(ns metabase-enterprise.serialization.db
  "Application database queries for the serialization module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model-level helpers."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn collection-id-row
  "The `:collection_id` row of the instance of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one [model :collection_id] :id id))

(mu/defn existing-ids
  "The subset of `ids` for which an instance of `model` exists."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select-pks-set model {:where [:in :id ids]}))

(mu/defn instance-exists?
  "Whether an instance of `model` whose primary key is `id` exists."
  [model :- :keyword
   id    :- [:maybe ms/PositiveInt]]
  (t2/exists? model (first (t2/primary-keys model)) id))
