(ns metabase-enterprise.stale.impl
  (:require
   [metabase.staleness.core :as staleness]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private FindStaleContentArgs
  [:map
   [:collection-ids [:set {:doc "The set of collection IDs to search for stale content."} [:maybe :int]]]
   [:cutoff-date [:time/local-date {:doc "The cutoff date for stale content."}]]
   [:limit  [:maybe {:doc "The limit for pagination."} :int]]
   [:offset [:maybe {:doc "The offset for pagination."} :int]]
   [:sort-column  [:enum {:doc "The column to sort by."} :name :last_used_at]]
   [:sort-direction  [:enum {:doc "The direction to sort by."} :asc :desc]]
   [:models {:optional true} [:set {:doc "The set of models to search for stale content."} :keyword]]])

(defn- sort-column [column]
  (case column
    :name :%lower.name
    :last_used_at :last_used_at))

(defn- queries [{:keys [models] :or {models #{:model/Card :model/Dashboard}} :as args}]
  ;; Ensure each model's namespace is loaded so its `find-stale-query` method is registered before we
  ;; dispatch — passing the `:model/X` keyword alone does not trigger Toucan model resolution.
  (run! t2/resolve-model models)
  (when-let [unsupported (seq (remove #(get-method staleness/find-stale-query %) models))]
    (throw (ex-info (str "No staleness method registered for: " (vec unsupported)) {})))
  (map #(staleness/find-stale-query % args) models))

(mu/defn ^:private rows-query [{:keys [limit offset] :as args} :- FindStaleContentArgs]
  (cond-> {:select [:id :model]
           :from [[{:union-all (queries args)} :dummy_alias]]
           :order-by [[(sort-column (:sort-column args))
                       (:sort-direction args)]]}
    (some? limit) ;; limit
    (assoc :limit limit)
    (some? offset) ;; offset
    (assoc :offset offset)))

(mu/defn ^:private total-query [args :- FindStaleContentArgs]
  {:select [[:%count.* :count]]
   :from [[{:union-all (queries args)} :dummy_alias]]})

(mu/defn find-candidates :- [:map
                             [:rows [:sequential [:map
                                                  [:id pos-int?]
                                                  [:model keyword?]]]]
                             [:total :int]]
  "Find stale content in the given collections.

  Arguments are defined by [[FindStaleContentArgs]]:

  - `collection-ids`: the set of collection IDs to look for stale content in. Non-recursive, the exact set you pass in
  will be searched

  - `cutoff-date`: if something was last accessed before this date, it is 'stale'

  - `limit` / `offset`: to support pagination

  - `sort-column`: one of `:name` or `:last_used_at` (column to sort on)

  - `sort-direction`: `:asc` or `:desc`

  Returns a map containing two keys,

  - `:rows` (a collection of maps containing an `:id` and `:model` field, like `{:id 1 :model :model/Card}`), and

  - `:total` (the total count of stale elements that could be found if you iterated through all pages)
  "
  [{:keys [collection-ids] :as args} :- FindStaleContentArgs]
  (when (contains? collection-ids :root) (throw (ex-info "not implemented." {:collection-ids collection-ids})))
  {:rows (into []
               (comp
                (map #(select-keys % [:id :model]))
                (map (fn [v] (update v :model #(keyword "model" %)))))
               (t2/query (rows-query args)))
   :total (:count (t2/query-one (total-query args)))})
