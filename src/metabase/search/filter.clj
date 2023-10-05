(ns metabase.search.filter
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
   [metabase.driver.common.parameters.dates :as params.dates]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.config :as search.config :refer [SearchableModel SearchContext]]
   [metabase.search.util :as search.util]
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

;; Databases can't be archived
(defmethod archived-clause "database"
  [_model archived?]
  (if archived?
    false-clause
    true-clause))

(defmethod archived-clause "indexed-entity"
  [_model archived?]
  (if-not archived?
    true-clause
    false-clause))

;; Table has an `:active` flag, but no `:archived` flag; never return inactive Tables
(defmethod archived-clause "table"
  [model archived?]
  (if archived?
    false-clause ; No tables should appear in archive searches
    [:and
     [:= (search.config/column-with-model-alias model :active) true]
     [:= (search.config/column-with-model-alias model :visibility_type) nil]]))

(defn- search-string-clause
  [model query searchable-columns]
  (when query
    (into [:or]
          (for [column searchable-columns
                token (search.util/tokenize (search.util/normalize query))]
            (if (and (= model "indexed-entity") (premium-features/sandboxed-or-impersonated-user?))
              [:= 0 1]

              [:like
               [:lower column]
               (search.util/wildcard-match token)])))))

(mu/defn ^:private search-string-clause-for-model
  [model          :- SearchableModel
   search-context :- SearchContext]
  (search-string-clause model (:search-string search-context)
                        (map #(search.config/column-with-model-alias model %)
                             (search.config/searchable-columns-for-model model))))


;; ------------------------------------------------------------------------------------------------;;
;;                                         Optional filters                                        ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti ^:private build-optional-filter-query
  "Build the query to filter by `filter`.
  Dispath with an array of [filter model-name]."
  {:arglists '([model fitler query filter-value])}
  (fn [filter model _query _filter-value]
    [filter model]))

(defmethod build-optional-filter-query :default
  [filter model _query _creator-id]
  (throw (ex-info (format "%s filter for %s is not supported" filter model) {:filter filter :model model})))

;; Created by filters
(defn- default-created-by-fitler-clause
  [model creator-ids]
  (if (= 1 (count creator-ids))
    [:= (search.config/column-with-model-alias model :creator_id) (first creator-ids)]
    [:in (search.config/column-with-model-alias model :creator_id) creator-ids]))

(doseq [model ["card" "dataset" "dashboard" "action"]]
  (defmethod build-optional-filter-query [:created-by model]
    [_filter model query creator-ids]
    (sql.helpers/where query (default-created-by-fitler-clause model creator-ids))))

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

(doseq [model ["collection" "database" "table" "dashboard" "card" "dataset" "action"]]
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

(doseq [model ["dashboard" "card" "dataset" "metric"]]
  (defmethod build-optional-filter-query [:last-edited-by model]
    [_filter model query editor-ids]
    (cond-> query
      ;; both last-edited-by and last-edited-at join with revision, so we should be careful not to join twice
      (not (joined-with-table? query :join :revision))
      (-> (sql.helpers/join :revision [:= :revision.model_id (search.config/column-with-model-alias model :id)])
          (sql.helpers/where [:= :revision.most_recent true]
                             [:= :revision.model (search.config/search-model->revision-model model)]))
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
                             [:= :revision.model (search.config/search-model->revision-model model)]))
      true
      ;; on UI we showed the the last edit info from revision.timestamp
      ;; not the model.updated_at column
      ;; to be consistent we use revision.timestamp to do the filtering
      (sql.helpers/where (date-range-filter-clause :revision.timestamp last-edited-at)))))

;; TODO: once we record revision for actions, we should update this to use the same approach with dashboard/card
(defmethod build-optional-filter-query [:last-edited-at "action"]
  [_filter model query last-edited-at]
  (sql.helpers/where query (date-range-filter-clause
                              (search.config/column-with-model-alias model :updated_at)
                              last-edited-at)))

(defn- feature->supported-models
  "Return A map of filter to its support models.

  E.g: {:created-by #{\"card\" \"dataset\" \"dashboard\" \"action\"}}

  This is function instead of a def so that optional-filter-clause can be defined anywhere in the codebase."
  []
  (->> (dissoc (methods build-optional-filter-query) :default)
       keys
       (reduce (fn [acc [filter model]]
                 (update acc filter set/union #{model}))
               {})))

;; ------------------------------------------------------------------------------------------------;;
;;                                        Public functions                                         ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defn search-context->applicable-models :- [:set SearchableModel]
  "Returns a set of models that are applicable given the search context.

  If the context has optional filters, the models will be restricted for the set of supported models only."
  [search-context :- SearchContext]
  (let [{:keys [created-at
                created-by
                last-edited-at
                last-edited-by
                models
                verified]} search-context]
    (cond-> models
      (some? created-at)     (set/intersection (:created-at (feature->supported-models)))
      (some? created-by)     (set/intersection (:created-by (feature->supported-models)))
      (some? last-edited-at) (set/intersection (:last-edited-at (feature->supported-models)))
      (some? last-edited-by) (set/intersection (:last-edited-by (feature->supported-models)))
      (some? verified)       (set/intersection (:verified (feature->supported-models))))))

(mu/defn build-filters :- map?
  "Build the search filters for a model."
  [honeysql-query :- :map
   model          :- SearchableModel
   search-context :- SearchContext]
  (let [{:keys [archived?
                created-at
                created-by
                last-edited-at
                last-edited-by
                search-string
                verified]}    search-context]
    (cond-> honeysql-query
      (not (str/blank? search-string))
      (sql.helpers/where (search-string-clause-for-model model search-context))

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
      (#(build-optional-filter-query :verified model % verified)))))
