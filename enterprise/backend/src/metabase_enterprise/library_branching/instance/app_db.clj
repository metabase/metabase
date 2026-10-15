(ns metabase-enterprise.library-branching.instance.app-db
  "The instance of the app DB that this process uses, as an `Instance`: its synced snapshot is the content of the
  in-scope items of the kinds of [[kind-stores]]."
  (:require
   [clojure.edn :as edn]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.kinds.collection :as kinds.collection]
   [metabase-enterprise.library-branching.instance.kinds.measure :as kinds.measure]
   [metabase-enterprise.library-branching.instance.kinds.metric :as kinds.metric]
   [metabase-enterprise.library-branching.instance.kinds.published-table :as kinds.published-table]
   [metabase-enterprise.library-branching.instance.kinds.segment :as kinds.segment]
   [metabase-enterprise.library-branching.instance.kinds.snippet :as kinds.snippet]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def kind-stores
  "`{kind KindStore}`: the kinds that this instance syncs, each with its store."
  {:collection      kinds.collection/kind-store
   :measure         kinds.measure/kind-store
   :metric          kinds.metric/kind-store
   :published-table kinds.published-table/kind-store
   :segment         kinds.segment/kind-store
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

(defn- base-row
  []
  (or (library-branching.db/base-row)
      (throw (ex-info "The app DB has no library branching base row." {}))))

(defn write-digests
  "The text of `digests`, `{identity digest}`, as the base row holds it: EDN, in the order of
  `snapshot/compare-identities`."
  [digests]
  (binding [*print-length* nil, *print-level* nil, *print-meta* false, *print-namespace-maps* false]
    (pr-str (into (sorted-map-by snapshot/compare-identities) digests))))

(defn base-digests
  "The digests of the base row, when its commit id is `commit`; else nil."
  [commit]
  (let [{:keys [commit_id digests]} (base-row)]
    (when (and (some? commit) (= commit commit_id) digests)
      (edn/read-string digests))))

(defn set-base!
  "Moves the base row from `expected` to `new`, with `digests`, in one compare-and-swap: :ok, or {:moved actual}."
  [expected new digests]
  (if (= 1 (library-branching.db/compare-and-set-base! expected new (write-digests digests)))
    :ok
    {:moved (:commit_id (base-row))}))

(defrecord AppDbInstance [stores roots]
  instance/Instance
  (read-snapshot [_]
    {:snapshot (read-at-read-point stores roots)})
  (base [_] (:commit_id (base-row)))
  (base-digests [_ commit] (base-digests commit))
  (apply-plan! [_ _plan _new-base] (instance/not-yet! `instance/apply-plan!))
  (set-base! [_ expected new digests] (set-base! expected new digests)))

(defn app-db-instance
  "The `Instance` of this process's app DB, for `stores` (default [[kind-stores]]) and `roots` (default
  [[scope/roots]])."
  ([] (app-db-instance kind-stores scope/roots))
  ([stores roots] (->AppDbInstance stores roots)))
