(ns metabase.remote-sync.synced
  "Which models remote sync syncs, how it names their rows, and whether those rows can be written, which synced rows
  can't on a read-only instance."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]
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

(mu/defn synced-changes? :- :boolean
  "Whether `changes` to `instance` of `model` change a column an export of it holds."
  [model    :- :keyword
   instance :- [:fn map?]
   changes  :- [:fn map?]]
  (boolean (some (fn [[k v]] (not= v (get instance k)))
                 (select-keys changes (serialization/columns model)))))
