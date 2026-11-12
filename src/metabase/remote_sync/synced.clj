(ns metabase.remote-sync.synced
  "Which models remote sync syncs, how it names their rows, and whether those rows can be written, which synced rows
  can't on a read-only instance."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.remote-sync.cache :as remote-sync.cache]
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

(defn synced-name
  "The name for people of `entity`, an exported entity of `model`, or nil."
  [model entity]
  ((:name (remote-sync.spec/spec model) :name) entity))

(defenterprise read-only?
  "Whether remote sync is on and keeps the rows it syncs read-only, which it never is without remote sync."
  metabase-enterprise.remote-sync.settings
  []
  false)

(defn do-with-read-only-pks-cache
  "Calls `thunk` with the read-only rows of each model looked up for the rows the request loaded, keeping a cache
  already in place."
  [thunk]
  (remote-sync.cache/do-with-cache thunk))

(mu/defn can-write? :- :boolean
  "Whether the row of `model` with the primary key `pk` can be written, which a read-only row can't on a read-only
  instance."
  [model :- :keyword
   pk    :- ::remote-sync.schema/pk]
  (or (not (read-only?))
      (not (remote-sync.cache/read-only-row? model pk))))

(mu/defn collection-content-writable? :- :boolean
  "Whether content in the Collection with `collection-id` can be written, which content in a read-only Collection
  can't on a read-only instance; content outside a Collection always can."
  [collection-id :- [:maybe pos-int?]]
  (or (nil? collection-id)
      (can-write? :model/Collection collection-id)))

(mu/defn can-write-filter-clause :- [:fn vector?]
  "The HoneySQL where-clause over the columns of `model`'s table, aliased `alias`, selecting the rows that can be
  written (see [[can-write?]])."
  [model :- :keyword
   alias :- :keyword]
  (if (read-only?)
    (remote-sync.db/writable-filter-clause model alias)
    remote-sync.db/all-rows-filter-clause))

(mu/defn synced-changes? :- :boolean
  "Whether `changes` to `instance` of `model` change a column an export of it holds."
  [model    :- :keyword
   instance :- [:fn map?]
   changes  :- [:fn map?]]
  (boolean (some (fn [[k v]] (not= v (get instance k)))
                 (select-keys changes (serialization/columns model)))))
