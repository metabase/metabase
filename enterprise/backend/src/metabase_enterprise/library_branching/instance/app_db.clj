(ns metabase-enterprise.library-branching.instance.app-db
  "The instance of the app DB that this process uses, as an `Instance`: its synced snapshot is the content of the
  in-scope items of the kinds of [[kind-stores]]."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.kinds.collection :as kinds.collection]
   [metabase-enterprise.library-branching.instance.kinds.metric :as kinds.metric]
   [metabase-enterprise.library-branching.instance.kinds.published-table :as kinds.published-table]
   [metabase-enterprise.library-branching.instance.kinds.snippet :as kinds.snippet]
   [metabase-enterprise.library-branching.scope :as scope]))

(set! *warn-on-reflection* true)

(def kind-stores
  "`{kind KindStore}`: the kinds that this instance syncs, each with its store."
  {:collection      kinds.collection/kind-store
   :metric          kinds.metric/kind-store
   :published-table kinds.published-table/kind-store
   :snippet         kinds.snippet/kind-store})

(defn read-current
  "The synced snapshot for `stores` (`{kind KindStore}`, default [[kind-stores]]) and `roots` (default
  [[scope/roots]]), read in the current transaction: the content of each in-scope item of each kind of `stores`.
  The reads see one moment only when the current transaction gives one."
  ([]
   (read-current kind-stores scope/roots))
  ([stores roots]
   (let [ids (scope/scope-ids roots (sort (keys stores)))]
     (into {}
           (mapcat (fn [[kind ks]] (instance/read-all ks (get ids kind))))
           (sort-by key stores)))))

(defn read-at-read-point
  "[[read-current]] in a new read-only transaction at REPEATABLE READ: one read point for the whole snapshot."
  [stores roots]
  (library-branching.db/do-with-read-point #(read-current stores roots)))

(defrecord AppDbInstance [stores roots]
  instance/Instance
  (read-snapshot [_]
    {:snapshot (read-at-read-point stores roots)})
  (base [_] (instance/not-yet! `instance/base))
  (apply-plan! [_ _plan _new-base] (instance/not-yet! `instance/apply-plan!))
  (set-base! [_ _expected _new] (instance/not-yet! `instance/set-base!)))

(defn app-db-instance
  "The `Instance` of this process's app DB, for `stores` (default [[kind-stores]]) and `roots` (default
  [[scope/roots]])."
  ([] (app-db-instance kind-stores scope/roots))
  ([stores roots] (->AppDbInstance stores roots)))
