(ns metabase-enterprise.stale.impl
  (:require
   [metabase.staleness.core :as staleness]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private FindStaleContentArgs
  [:map
   ;; Either an explicit set of collection IDs (collection-scoped), or the `:all` sentinel for an
   ;; instance-wide sweep that omits the collection predicate entirely (used by Content Diagnostics).
   [:collection-ids [:or
                     [:= {:doc "Instance-wide sweep — no collection filter."} :all]
                     [:set {:doc "The set of collection IDs to search for stale content."} [:maybe :int]]]]
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
  (cond-> {:select [:id :model :last_used_at :name :created_at :creator_id]
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
                                                  [:model keyword?]
                                                  ;; the entity's last-activity anchor (card `last_used_at`,
                                                  ;; dashboard `last_viewed_at`, both aliased to `last_used_at`);
                                                  ;; `nil` is the never-used arm. Optional for back-compat.
                                                  [:last_used_at {:optional true} [:maybe some?]]
                                                  ;; denormalization substrate for Content Diagnostics sort
                                                  ;; columns (name / created_at / creator). Optional.
                                                  [:name       {:optional true} [:maybe :string]]
                                                  [:created_at {:optional true} [:maybe some?]]
                                                  [:creator_id {:optional true} [:maybe :int]]]]]
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

  - `:rows` (a collection of maps containing `:id`, `:model`, and `:last_used_at` — the entity's last-activity
  anchor; like `{:id 1 :model :model/Card :last_used_at #inst \"…\"}`), and

  - `:total` (the total count of stale elements that could be found if you iterated through all pages)
  "
  [{:keys [collection-ids] :as args} :- FindStaleContentArgs]
  (when (and (set? collection-ids) (contains? collection-ids :root))
    (throw (ex-info "not implemented." {:collection-ids collection-ids})))
  {:rows (into []
               (comp
                (map #(select-keys % [:id :model :last_used_at :name :created_at :creator_id]))
                (map (fn [v] (update v :model #(keyword "model" %)))))
               (t2/query (rows-query args)))
   :total (:count (t2/query-one (total-query args)))})
