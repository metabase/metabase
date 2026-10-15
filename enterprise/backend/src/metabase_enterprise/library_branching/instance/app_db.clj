(ns metabase-enterprise.library-branching.instance.app-db
  "The instance of the app DB that this process uses, as an `Instance`: its synced snapshot is the content of the
  in-scope items of the kinds of [[kind-stores]]."
  (:require
   [clojure.edn :as edn]
   [metabase-enterprise.library-branching.apply :as apply]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.in-use :as in-use]
   [metabase-enterprise.library-branching.instance.kinds.collection :as kinds.collection]
   [metabase-enterprise.library-branching.instance.kinds.glossary :as kinds.glossary]
   [metabase-enterprise.library-branching.instance.kinds.measure :as kinds.measure]
   [metabase-enterprise.library-branching.instance.kinds.metric :as kinds.metric]
   [metabase-enterprise.library-branching.instance.kinds.model :as kinds.model]
   [metabase-enterprise.library-branching.instance.kinds.published-table :as kinds.published-table]
   [metabase-enterprise.library-branching.instance.kinds.question :as kinds.question]
   [metabase-enterprise.library-branching.instance.kinds.segment :as kinds.segment]
   [metabase-enterprise.library-branching.instance.kinds.snippet :as kinds.snippet]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def kind-stores
  "`{kind KindStore}`: the kinds that this instance syncs, each with its store."
  {:collection      kinds.collection/kind-store
   :glossary-term   kinds.glossary/kind-store
   :measure         kinds.measure/kind-store
   :metric          kinds.metric/kind-store
   :model           kinds.model/kind-store
   :published-table kinds.published-table/kind-store
   :question        kinds.question/kind-store
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

(defn- read-at-read-point
  "`{:snapshot s :shadowed-tables ts}` in a new read-only transaction at REPEATABLE READ, one read point for both: `s`
  is [[read-current]], and `ts` is `scope/shadowed-tables` when `stores` holds published tables, else empty."
  [stores roots]
  (library-branching.db/do-with-read-point (into #{} (mapcat instance/read-models) (vals stores))
                                           (fn []
                                             {:snapshot        (read-current stores roots)
                                              :shadowed-tables (if (contains? stores :published-table)
                                                                 (scope/shadowed-tables roots)
                                                                 [])})))

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

(defn base
  "The base of the repository at `url`: the commit id of the base row when the row holds `url`, else nil."
  [url]
  (let [{:keys [commit_id] :as row} (base-row)]
    (when (= url (:url row))
      commit_id)))

(defn base-digests
  "The digests of the base row, when the base of `url` is `commit`; else nil."
  [url commit]
  (let [{:keys [digests]} (base-row)]
    (when (and (some? commit) (= commit (base url)) digests)
      (edn/read-string digests))))

(defn set-base!
  "Moves the base of the repository at `url` from `expected` to `new`, with `digests`, in one compare-and-swap: :ok, or
  {:moved actual}, where `actual` is the base of `url`."
  [url expected new digests]
  (if (= 1 (library-branching.db/compare-and-set-base! url expected new (write-digests digests)))
    :ok
    {:moved (base url)}))

(defn- kind-store
  [stores kind id]
  (or (get stores kind)
      (instance/refuse! :unknown-kind id (str "The instance has no kind " kind "."))))

(defn- stub
  [stores kind id content refs]
  (let [ks (kind-store stores kind id)]
    (if (satisfies? instance/Stub ks)
      (instance/stub ks id content refs)
      (instance/refuse! :reference-cycle id
                        (str "A new item of the kind " (name kind) " cannot be written before the items it refers to.")))))

(defn- ops
  [stores roots url]
  {:current   (fn [kind id] (instance/current (kind-store stores kind id) id))
   :write!    (fn [kind id content] (instance/write! (kind-store stores kind id) id content))
   :trash!    (fn [kind id] (instance/trash! (kind-store stores kind id) id))
   :stub      (partial stub stores)
   :set-base! (partial set-base! url)
   :in-use    (partial in-use/trashed-in-use roots)})

(defn apply-plan!
  "`apply/apply-plan` of `plan` with the kind stores `stores`, moving the base of the repository at `url`, in a
  transaction of [[library-branching.db/do-in-locking-transaction]] that commits only an `:ok` result."
  [stores roots url plan opts]
  (let [result (volatile! nil)]
    (try
      (library-branching.db/do-in-locking-transaction
       (fn []
         (let [r (apply/apply-plan (ops stores roots url) plan opts)]
           (vreset! result r)
           (when-not (contains? r :ok)
             (throw (ex-info "The apply writes nothing." {::rollback true}))))))
      (catch clojure.lang.ExceptionInfo e
        (when-not (::rollback (ex-data e))
          (throw e))))
    @result))

(defrecord AppDbInstance [stores roots url]
  instance/Instance
  (read-snapshot [_]
    (read-at-read-point stores roots))
  (base [_] (base url))
  (base-digests [_ commit] (base-digests url commit))
  (table-names [_ table-keys] (kinds.published-table/sync-display-names table-keys))
  (apply-plan! [_ plan opts] (apply-plan! stores roots url plan opts))
  (set-base! [_ expected new digests] (set-base! url expected new digests)))

(defn app-db-instance
  "The `Instance` of this process's app DB, for `stores` (default [[kind-stores]]), `roots` (default [[scope/roots]])
  and the repository URL `url` (default nil). Its base is the base of the repository at `url`: the base row holds the
  URL with the commit, and an instance of another URL has no base."
  ([] (app-db-instance kind-stores scope/roots))
  ([stores roots] (app-db-instance stores roots nil))
  ([stores roots url] (->AppDbInstance stores roots url)))
