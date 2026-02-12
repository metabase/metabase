(ns metabase.search.filter
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor.parameters.dates :as qp.parameters.dates]
   [metabase.search.config :as search.config]
   [metabase.search.permissions :as search.permissions]
   [metabase.search.spec :as search.spec]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2])
  (:import
   (java.time LocalDate)))

(defn- remove-if-falsey [m k]
  (if (m k) m (dissoc m k)))

(defn- visible-to? [search-ctx {:keys [visibility] :as _spec}]
  (case visibility
    :all       true
    :app-user  (not (search.permissions/sandboxed-or-impersonated-user? search-ctx))
    :superuser (:is-superuser? search-ctx)))

(def ^:private context-key->filter
  "Map the context keys to their corresponding filters"
  (reduce-kv (fn [m k {:keys [context-key]}]
               (assoc m context-key k))
             {}
             ;; TODO remove special handling of :id
             (dissoc search.config/filters :id)))

(defn search-context->applicable-models
  "Returns a set of models that are applicable given the search context.

  If the context has optional filters, the models will be restricted for the set of supported models only."
  [search-ctx]
  ;; Archived is an eccentric one - we treat it as false for models that don't map it, rather than removing them.
  ;; TODO move this behavior to the spec somehow
  (let [required (->> (remove-if-falsey search-ctx :archived?) keys (keep context-key->filter))]
    (into #{}
          (remove nil?)
          (for [search-model (:models search-ctx)
                :let [spec (search.spec/spec search-model)]]
            (when (and (visible-to? search-ctx spec)
                       (every? (:attrs spec) required))
              (:name spec))))))

(defn models-without-collection
  "A list of the search models which are not associated with collections, even indirectly."
  []
  (->> (search.spec/specifications)
       vals
       (filter #(-> % :attrs :collection-id false?))
       (map :name)))

(defn- date-range-filter-clause
  [dt-col dt-val]
  (let [date-range (try
                     (qp.parameters.dates/date-string->range dt-val {:inclusive-end? false})
                     (catch Exception _e
                       (throw (ex-info (tru "Failed to parse datetime value: {0}" dt-val) {:status-code 400}))))
        start      (some-> (:start date-range) u.date/parse)
        end        (some-> (:end date-range) u.date/parse)
        dt-col     (if (some #(instance? LocalDate %) [start end])
                     [:cast dt-col :date]
                     dt-col)]
    (cond
      (= start end)
      [:= dt-col start]

      (nil? start)
      [:< dt-col end]

      (nil? end)
      [:>= dt-col start]

      :else
      [:and [:>= dt-col start] [:< dt-col end]])))

(defmulti ^:private where-clause*
  {:arglists '([filter-type column v])}
  (fn [filter-type _column _v] filter-type))

(defmethod where-clause* ::single-value [_ k v] [:= k v])

(defmethod where-clause* ::date-range [_ k v] (date-range-filter-clause k v))

(defmethod where-clause* ::list [_ k v] [:in k v])

(defmethod where-clause* ::collection-hierarchy [_ k v]
  ;; Filter by collection and all descendants
  ;; Match items directly in the collection OR in descendant collections
  ;; Tables in collections are an EE feature (library), so exclude them in OSS
  (let [collection-filter [:or
                           [:= k v]
                           [:like :collection.location (str "%" (collection/location-path v) "%")]]]
    (if (premium-features/has-feature? :library)
      collection-filter
      [:and
       [:not= :search_index.model [:inline "table"]]
       collection-filter])))

(defn personal-collections-where-clause
  "Build a clause limiting the entries to those (not) within or within personal collections, if relevant.
  WARNING: this method queries the appdb, and its approach will get very slow when there are many users!"
  [{filter-type :filter-items-in-personal-collection :keys [current-user-id] :as search-ctx} collection-id-col]
  (case (or filter-type "all")
    "all" nil

    "only-mine"
    [:or
     [:= :collection.personal_owner_id current-user-id]
     [:like :collection.location (format "/%d/%%" (t2/select-one-pk :model/Collection
                                                                    :personal_owner_id [:= current-user-id]
                                                                    :location          "/"))]]

    "exclude-others"
    (let [with-filter #(personal-collections-where-clause
                        (assoc search-ctx :filter-items-in-personal-collection %)
                        collection-id-col)]
      [:or (with-filter "only-mine") (with-filter "exclude")])

    (let [personal-ids   (t2/select-pks-vec :model/Collection :personal_owner_id [:not= nil] :location "/")
          child-patterns (for [id personal-ids] (format "/%d/%%" id))]
      (case filter-type
        "only"
        `[:or
          ;; top level personal collections
          [:and [:not= :collection.personal_owner_id nil] [:= :collection.location "/"]]
          ;; their sub-collections
          ~@(for [p child-patterns] [:like :collection.location p])]

        "exclude"
        `[:or
          ;; not in a collection
          [:= ~collection-id-col nil]
          [:and
           ;; neither in a top-level personal collection
           [:= :collection.personal_owner_id nil]
           ;; nor within one of their sub-collections
           ~@(for [p child-patterns] [:not-like :collection.location p])]]))))

(defn transform-source-type-where-clause
  "Build a clause that limits transforms to enabled source types.
  When a `model-col` is provided, non-transform models always pass through."
  ([search-context source-type-col]
   (let [enabled-types (:enabled-transform-source-types search-context)]
     (if (seq enabled-types)
       [:in source-type-col enabled-types]
       [:= [:inline 0] [:inline 1]])))
  ([search-context model-col source-type-col]
   [:or
    [:!= model-col [:inline "transform"]]
    (transform-source-type-where-clause search-context source-type-col)]))

(defn with-filters
  "Return a HoneySQL clause corresponding to all the optional search filters."
  [search-context qry]
  (as-> qry qry
    (sql.helpers/where qry (if (seq (:models search-context))
                             [:in :search_index.model (:models search-context)]
                             ;; Ideally, we would not get this far, and bail out earlier.
                             [:= 1 2]))
    (sql.helpers/where qry (when-let [ids (:ids search-context)]
                             [:and
                              [:in :search_index.model_id (map str ids)]
                              ;; NOTE: we limit id-based search to only a subset of the models
                              ;; TODO this should just become part of the model spec e.g. :search-by-id?
                              [:in :search_index.model ["card" "dataset" "metric" "dashboard" "action"]]]))
    (sql.helpers/where qry [:or
                            ;; leverage the fact that only card-related models populate this attribute
                            [:= nil :search_index.dashboard_id]
                            (when (:include-dashboard-questions? search-context)
                              [:not= [:inline 0] [:coalesce :search_index.dashboardcard_count [:inline 0]]])])
    (reduce (fn [qry {t :type :keys [context-key required-feature supported-value? field]}]
              (or (when-some [v (get search-context context-key)]
                    (assert (supported-value? v) (str "Unsupported value for " context-key " - " v))
                    (when (or (nil? required-feature) (premium-features/has-feature? required-feature))
                      (when-some [c (where-clause* t (keyword (str "search_index." field)) v)]
                        (sql.helpers/where qry c))))
                  qry))
            qry
            (vals (dissoc search.config/filters :id :native-query)))))
