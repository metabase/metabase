(ns metabase-enterprise.remote-sync.core
  "Remote sync: the context that decides which rows of each model it syncs, and what can be changed under it."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.collections.core :as collections]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.settings.core :as setting]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn context :- [:maybe ::remote-sync.schema/context]
  "The remote sync context, or nil when remote sync is off."
  []
  (when (some? (setting/get :remote-sync-url))
    {:read-only?  (= :read-only (setting/get :remote-sync-type))
     :library?    (boolean (some-> (collections/library-collection) collections/remote-synced-collection?))
     :transforms? (boolean (setting/get :remote-sync-transforms))}))

(defn synced-pks
  "The set of those of `pks` whose rows of `model` are synced under `ctx`."
  [model pks ctx]
  (if-let [clause (and (seq pks) (remote-sync/synced-where model :row ctx))]
    (remote-sync.db/pks-where model (vec pks) clause)
    #{}))

(defenterprise editable?
  "Whether the row of `model` with the primary key `pk` can be changed, which a synced row can't on a read-only
  instance; a nil `pk`, of a row not saved yet, is left to the read-only hook."
  :feature :none
  [model pk]
  (let [ctx (context)]
    (or (nil? pk)
        (not (:read-only? ctx))
        (empty? (synced-pks model [pk] ctx)))))

(defenterprise read-only-pks
  "The set of those of `pks` whose rows of `model` can't be changed."
  :feature :none
  [model pks]
  (let [ctx (context)]
    (if (:read-only? ctx)
      (synced-pks model (remove nil? pks) ctx)
      #{})))
