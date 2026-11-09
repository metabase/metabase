(ns metabase.remote-sync.synced
  "Which models remote sync syncs, how it names their rows, and whether those rows can be written, which synced rows
  can't on a read-only instance."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.remote-sync.db :as remote-sync.db]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.remote-sync.spec :as remote-sync.spec]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn synced-models
  "The models with a remote sync spec."
  []
  (sort (keys (methods remote-sync.spec/spec))))

(defn synced-label
  "The name for people of `entity`, an entity of `model`, or nil."
  [model entity]
  ((:label (remote-sync.spec/spec model) :name) entity))

(defn synced-collection-id
  "The id of the collection the UI shows the changes to `row`, a row of `model`, under, or nil."
  [model row]
  ((:collection-id (remote-sync.spec/spec model) :collection_id) row))

(defenterprise read-only?
  "Whether remote sync is on and keeps the rows it syncs read-only, which it never is without remote sync."
  metabase-enterprise.remote-sync.settings
  []
  false)

(mu/defn can-write? :- :boolean
  "Whether the row of `model` with the primary key `pk` can be written, which a synced or built-in row can't on a
  read-only instance."
  [model :- :keyword
   pk    :- ::remote-sync.schema/pk]
  (or (not (read-only?))
      (not (remote-sync.db/synced-or-built-in-row? model pk))))

(mu/defn can-write-filter-clause :- [:fn vector?]
  "The HoneySQL where-clause over the columns of `model`'s table, aliased `alias`, selecting the rows that can be
  written (see [[can-write?]])."
  [model :- :keyword
   alias :- :keyword]
  (if (read-only?)
    (remote-sync.db/not-synced-or-built-in-filter-clause model alias)
    remote-sync.db/all-rows-filter-clause))

(mu/defn synced-changes? :- :boolean
  "Whether `changes` to `instance` of `model` change a column an export of it holds."
  [model    :- :keyword
   instance :- [:fn map?]
   changes  :- [:fn map?]]
  (boolean (some (fn [[k v]] (not= v (get instance k)))
                 (select-keys changes (serialization/columns model)))))
