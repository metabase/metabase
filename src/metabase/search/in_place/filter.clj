(ns metabase.search.in-place.filter
  "Namespace that defines the filters that are applied to the search results.

  There are required filters and optional filters.
  Archived is an required filters and is always applied, the reason because by default we want to hide archived/inactive entities.

  But there are OPTIONAL FILTERS like :created-by, :created-at, when these filters are provided, the results will return only
  results of models that have these filters.

  The multi method for optional filters should have the default implementation to throw for unsupported models, and then each model
  that supports the filter should define its own method for the filter."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.audit-app.core :as audit]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.search.config :as search.config :refer [SearchableModel SearchContext]]
   [metabase.search.filter :as search.filter]
   [metabase.search.in-place.util :as search.util]
   [metabase.search.permissions :as search.permissions]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu])
  (:import
   (java.time LocalDate)))

(def ^:private true-clause [:inline [:= 1 1]])
(def ^:private false-clause [:inline [:= 0 1]])

;; ------------------------------------------------------------------------------------------------;;
;;                                         Required Filters                                         ;
;; ------------------------------------------------------------------------------------------------;;

(defmulti ^:private archived-clause
  "Clause to filter by the archived status of the entity."
  {:arglists '([model archived?])}
  (fn [model _] model))

(defmethod archived-clause :default
  [model archived?]
  [:= (search.config/column-with-model-alias model :archived) archived?])

;; Databases, transforms, and indexed-entities can't be archived
(doseq [model ["database" "transform" "indexed-entity"]]
  (defmethod archived-clause model
    [_model archived?]
    (if archived?
      false-clause
      true-clause)))

;; Table has an `:active` flag, but no `:archived` flag; never return inactive Tables
(defmethod archived-clause "table"
  [model archived?]
  (if archived?
    false-clause ; No tables should appear in archive searches
    [:and
     [:= (search.config/column-with-model-alias model :active) true]
     [:= (search.config/column-with-model-alias model :visibility_type) nil]]))

(mu/defn- search-string-clause-for-model
  [model                :- SearchableModel
   search-context       :- SearchContext
   search-native-query  :- [:maybe :boolean]]
  (when-let [query (:search-string search-context)]
    (into
     [:or]
     (for [column           (->> (let [search-columns-fn (requiring-resolve 'metabase.search.in-place.legacy/searchable-columns)]
                                   (search-columns-fn model search-native-query))
                                 (map #(search.config/column-with-model-alias model %)))
           wildcarded-token (->> (search.util/normalize query)
                                 search.util/tokenize
                                 (map search.util/wildcard-match))]
       (cond
         (and (= model "indexed-entity") (search.permissions/sandboxed-or-impersonated-user? search-context))
         [:= 0 1]

         (and (#{"card" "dataset"} model) (= column (search.config/column-with-model-alias model :dataset_query)))
         [:and
          [:= (search.config/column-with-model-alias model :query_type) "native"]
          [:like [:lower column] wildcarded-token]]

         (and (#{"action"} model)
              (= column (search.config/column-with-model-alias model :dataset_query)))
         [:like [:lower :query_action.dataset_query] wildcarded-token]

         :else
         [:like [:lower column] wildcarded-token])))))

;; ------------------------------------------------------------------------------------------------;;
;;                                         Optional filters                                        ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti ^:private build-optional-filter-query
  "Build the query to filter by `filter`.
  Dispatch with an array of [filter model-name]."
  {:arglists '([model filter query filter-value])}
  (fn [filter model _query _filter-value]
    [filter model]))

(defmethod build-optional-filter-query :default
  [filter model _query _filter-value]
  (throw (ex-info (format "%s filter for %s is not supported" filter model) {:filter filter :model model})))

;; Created by filters
(defn- default-created-by-filter-clause
  [model creator-ids]
  (if (= 1 (count creator-ids))
    [:= (search.config/column-with-model-alias model :creator_id) (first creator-ids)]
    [:in (search.config/column-with-model-alias model :creator_id) creator-ids]))

(doseq [model ["card" "dataset" "metric" "dashboard" "action" "document"]]
  (defmethod build-optional-filter-query [:created-by model]
    [_filter model query creator-ids]
    (sql.helpers/where query (default-created-by-filter-clause model creator-ids))))

(doseq [model ["card" "dataset" "metric" "dashboard" "action"]]
  (defmethod build-optional-filter-query [:id model]
    [_filter model query ids]
    (sql.helpers/where query [:in (search.config/column-with-model-alias model :id) ids])))

;; Verified filters

(defmethod build-optional-filter-query [:verified "card"]
  [_filter model query verified]
  (assert (true? verified) "filter for non-verified cards is not supported")
  (if (premium-features/has-feature? :content-verification)
    (-> query
        (sql.helpers/join :moderation_review
                          [:= :moderation_review.moderated_item_id
                           (search.config/column-with-model-alias model :id)])
        (sql.helpers/where [:= :moderation_review.status "verified"]
                           [:= :moderation_review.moderated_item_type "card"]
                           [:= :moderation_review.most_recent true]))
    (sql.helpers/where query false-clause)))

(defmethod build-optional-filter-query [:verified "dataset"]
  [filter _model query verified]
  (build-optional-filter-query filter "card" query verified))

(defmethod build-optional-filter-query [:verified "metric"]
  [filter _model query verified]
  (build-optional-filter-query filter "card" query verified))

(defmethod build-optional-filter-query [:verified "dashboard"]
  [_filter model query verified]
  (assert (true? verified) "filter for non-verified dashboards is not supported")
  (if (premium-features/has-feature? :content-verification)
    (-> query
        (sql.helpers/join :moderation_review
                          [:= :moderation_review.moderated_item_id
                           (search.config/column-with-model-alias model :id)])
        (sql.helpers/where [:= :moderation_review.status "verified"]
                           [:= :moderation_review.moderated_item_type "dashboard"]
                           [:= :moderation_review.most_recent true]))
    (sql.helpers/where query false-clause)))

;; Created at filters

(defn- date-range-filter-clause
  [dt-col dt-val]
  (let [date-range (try
                     (params.dates/date-string->range dt-val {:inclusive-end? false})
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
      [:> dt-col start]

      :else
      [:and [:>= dt-col start] [:< dt-col end]])))

(doseq [model ["collection" "database" "table" "dashboard" "card" "dataset" "metric" "action" "document"
               "transform"]]
  (defmethod build-optional-filter-query [:created-at model]
    [_filter model query created-at]
    (sql.helpers/where query (date-range-filter-clause
                              (search.config/column-with-model-alias model :created_at)
                              created-at))))

;; Last edited by filter

(defn- joined-with-table?
  "Check if  the query have a join with `table`.
  Note: this does a very shallow check by only checking if the join-clause is the same.
  Using the same table with a different alias will return false.

    (-> (sql.helpers/select :*)
        (sql.helpers/from [:a])
        (sql.helpers/join :b [:= :a.id :b.id])
        (joined-with-table? :join :b))

    ;; => true"
  [query join-type table]
  (->> (get query join-type) (partition 2) (map first) (some #(= % table)) boolean))

;; We won't need this post-legacy as it defines the joins à la carte.
(defn- search-model->revision-model [model]
  ((requiring-resolve 'metabase.search.in-place.legacy/search-model->revision-model) model))

(doseq [model ["dashboard" "card" "dataset" "metric"]]
  (defmethod build-optional-filter-query [:last-edited-by model]
    [_filter model query editor-ids]
    (cond-> query
      ;; both last-edited-by and last-edited-at join with revision, so we should be careful not to join twice
      (not (joined-with-table? query :join :revision))
      (-> (sql.helpers/join :revision [:= :revision.model_id (search.config/column-with-model-alias model :id)])
          (sql.helpers/where [:= :revision.most_recent true]
                             [:= :revision.model (search-model->revision-model model)]))
      (= 1 (count editor-ids))
      (sql.helpers/where [:= :revision.user_id (first editor-ids)])

      (> (count editor-ids) 1)
      (sql.helpers/where [:in :revision.user_id editor-ids]))))

(doseq [model ["dashboard" "card" "dataset" "metric"]]
  (defmethod build-optional-filter-query [:last-edited-at model]
    [_filter model query last-edited-at]
    (cond-> query
      ;; both last-edited-by and last-edited-at join with revision, so we should be careful not to join twice
      (not (joined-with-table? query :join :revision))
      (-> (sql.helpers/join :revision [:= :revision.model_id (search.config/column-with-model-alias model :id)])
          (sql.helpers/where [:= :revision.most_recent true]
                             [:= :revision.model (search-model->revision-model model)]))
      true
      ;; on UI we showed the the last edit info from revision.timestamp
      ;; not the model.updated_at column
      ;; to be consistent we use revision.timestamp to do the filtering
      (sql.helpers/where (date-range-filter-clause :revision.timestamp last-edited-at)))))

;; These filters are really only supported by the :appdb engine as they require a search index.
;; By building this no-op filter definition for the in-place engine we can at least appropriately
;; reduce the intended supported models that are searched. See PR 60912
(doseq [model ["card" "dataset" "metric"]]
  (defmethod build-optional-filter-query [:non-temporal-dim-ids model]
    [_filter _model query _non-temporal-dim-ids]
    query))

(doseq [model ["card" "dataset" "metric"]]
  (defmethod build-optional-filter-query [:has-temporal-dim model]
    [_filter _model query _has-temporal-dim]
    query))

;; TODO: once we record revision for actions, we should update this to use the same approach with dashboard/card
(defmethod build-optional-filter-query [:last-edited-at "action"]
  [_filter model query last-edited-at]
  (sql.helpers/where query (date-range-filter-clause
                            (search.config/column-with-model-alias model :updated_at)
                            last-edited-at)))

;; Display types filter
(doseq [model ["card" "dataset" "metric"]]
  (defmethod build-optional-filter-query [:display-type model]
    [_filter model query display-types]
    (sql.helpers/where query [:in (search.config/column-with-model-alias model :display) display-types])))

;; Collection filter - filters by collection and all descendants
(doseq [model ["card" "dataset" "metric" "dashboard" "collection" "document"]]
  (defmethod build-optional-filter-query [:collection model]
    [_filter model query collection-id]
    (let [collection-col (search.config/column-with-model-alias model :collection_id)]
      ;; Join with collection table if not already joined to get location for descendant filtering
      ;; Filter by direct match (collection_id = ?) OR descendants (collection.location LIKE '/collection_id/%')
      (cond-> query
        (not= "collection" model)
        (sql.helpers/where [:or
                            [:= collection-col collection-id]
                            [:like :collection.location (str "%" (collection/location-path collection-id) "%")]])

        (= "collection" model)
        (sql.helpers/where [:or
                            [:= :collection.id collection-id]
                            [:like :collection.location (str "%" (collection/location-path collection-id) "%")]])))))

(defmethod build-optional-filter-query [:collection "table"]
  [_filter model query collection-id]
  ;; Tables in collections are an EE feature (library)
  (if (premium-features/has-feature? :library)
    (let [collection-col (search.config/column-with-model-alias model :collection_id)
          published-col  (search.config/column-with-model-alias model :is_published)]
      (sql.helpers/where query [:and
                                [:= published-col true]
                                [:or
                                 [:= collection-col collection-id]
                                 [:like :collection.location (str "%" (collection/location-path collection-id) "%")]]]))
    ;; OSS: tables don't belong to collections
    (sql.helpers/where query false-clause)))

;; Things that don't belong to collections
(doseq [model ["database" "action" "indexed-entity"]]
  (defmethod build-optional-filter-query [:collection model]
    [_filter _model query _collection-id]
    ;; These models don't have collection_id, so they never match
    (sql.helpers/where query false-clause)))

(defn- feature->supported-models
  "Return A map of filter to its support models.

  E.g: {:created-by #{\"card\" \"dataset\" \"dashboard\" \"action\"}}

  This is function instead of a def so that optional-filter-clause can be defined anywhere in the codebase."
  []
  (-> (merge
        ;; models support search-native-query if there are additional columns to search when the `search-native-query`
        ;; argument is true
       {:search-native-query (->> (dissoc (methods @(requiring-resolve 'metabase.search.in-place.legacy/searchable-columns)) :default)
                                  (filter (fn [[model f]]
                                            (seq (set/difference (set (f model true)) (set (f model false))))))
                                  (map first)
                                  set)}
       (->> (dissoc (methods build-optional-filter-query) :default)
            keys
            (reduce (fn [acc [filter model]]
                      (update acc filter set/union #{model}))
                    {})))
      (update :collection disj "database")
      (update :collection conj "indexed-entity")))

;; ------------------------------------------------------------------------------------------------;;
;;                                        Public functions                                         ;;
;; ------------------------------------------------------------------------------------------------;;

(defn search-context->applicable-models
  "Returns a set of models that are applicable given the search context.

  If the context has optional filters, the models will be restricted for the set of supported models only."
  [search-context]
  (let [{:keys [collection
                created-at
                created-by
                last-edited-at
                last-edited-by
                models
                search-native-query
                verified
                non-temporal-dim-ids
                has-temporal-dim
                display-type
                is-superuser?]} search-context
        enabled-types (:enabled-transform-source-types search-context)
        feature->supported-models (feature->supported-models)]
    (cond-> models
      (not   is-superuser?)        (disj "transform")
      (empty? enabled-types)       (disj "transform")
      (some? collection)           (set/intersection (:collection feature->supported-models))
      (some? created-at)           (set/intersection (:created-at feature->supported-models))
      (some? created-by)           (set/intersection (:created-by feature->supported-models))
      (some? last-edited-at)       (set/intersection (:last-edited-at feature->supported-models))
      (some? last-edited-by)       (set/intersection (:last-edited-by feature->supported-models))
      (true? search-native-query)  (set/intersection (:search-native-query feature->supported-models))
      (true? verified)             (set/intersection (:verified feature->supported-models))
      (some? non-temporal-dim-ids) (set/intersection (:non-temporal-dim-ids feature->supported-models))
      (some? has-temporal-dim)     (set/intersection (:has-temporal-dim feature->supported-models))
      (seq   display-type)         (set/intersection (:display-type feature->supported-models)))))

(mu/defn build-filters :- :map
  "Build the search filters for a model."
  [honeysql-query :- :map
   model          :- SearchableModel
   search-context :- SearchContext]
  (let [{:keys [models
                archived?
                collection
                created-at
                created-by
                last-edited-at
                last-edited-by
                search-string
                search-native-query
                verified
                ids
                non-temporal-dim-ids
                has-temporal-dim
                display-type]} search-context]
    (cond-> honeysql-query
      (= model "transform")
      (sql.helpers/where (search.filter/transform-source-type-where-clause
                          search-context
                          (search.config/column-with-model-alias "transform" :source_type)))

      (not (str/blank? search-string))
      (sql.helpers/where (search-string-clause-for-model model search-context search-native-query))

      (some? archived?)
      (sql.helpers/where (archived-clause model archived?))

      ;; build optional filters
      (some? created-at)
      (#(build-optional-filter-query :created-at model % created-at))

      (some? created-by)
      (#(build-optional-filter-query :created-by model % created-by))

      (some? last-edited-at)
      (#(build-optional-filter-query :last-edited-at model % last-edited-at))

      (some? last-edited-by)
      (#(build-optional-filter-query :last-edited-by model % last-edited-by))

      (some? verified)
      (#(build-optional-filter-query :verified model % verified))

      (and (some? ids)
           (contains? models model))
      (#(build-optional-filter-query :id model % ids))

      (some? non-temporal-dim-ids)
      (#(build-optional-filter-query :non-temporal-dim-ids model % non-temporal-dim-ids))

      (some? has-temporal-dim)
      (#(build-optional-filter-query :has-temporal-dim model % has-temporal-dim))

      (seq display-type)
      (#(build-optional-filter-query :display-type model % display-type))

      (some? collection)
      (#(build-optional-filter-query :collection model % collection))

      (= "table" model)
      (sql.helpers/where
       [:not [:= (search.config/column-with-model-alias "table" :db_id) audit/audit-db-id]]))))
