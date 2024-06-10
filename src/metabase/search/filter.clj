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
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu])
  (:import
   (java.time LocalDate)))

(def false-clause
  "A clause which is always false. Useful for when you want to return no results."
  [:inline [:= 0 1]])

;; ------------------------------------------------------------------------------------------------;;
;;                                         Optional filters                                        ;;
;; ------------------------------------------------------------------------------------------------;;

(defmulti ^:private build-filter
  "Build the query to filter by `filter`.
  Dispatch with an array of [filter model-name].
  `filter-value` may be nil if the filter is not in the search context."
  {:arglists '([model filter query filter-value])}
  (fn [filter model _query _filter-value]
    [filter model]))

(defmethod build-filter :default
  [filter model query filter-value]
  (when (some? filter-value)
    (throw (ex-info (format "%s filter for %s is not supported" filter model) {:filter filter :model model})))
  query)

;; These models have an `archive` column and they can be archived
(doseq [model ["dashboard" "metric" "segment" "card" "dataset" "collection" "action"]]
  (defmethod build-filter [:archived model]
    [_filter model query archived]
    (sql.helpers/where query [:= (search.config/column-with-alias model :archived) (boolean archived)])))

; created-by

(doseq [model ["card" "dataset" "metric" "dashboard" "action"]]
  (defmethod build-filter [:created-by model]
    [_filter model query creator-ids]
    (cond-> query (seq creator-ids)
      (sql.helpers/where (if (= 1 (count creator-ids))
                           [:= (search.config/column-with-alias model :creator_id) (first creator-ids)]
                           [:in (search.config/column-with-alias model :creator_id) creator-ids])))))

;; verified filters

(doseq [model ["card" "dataset" "metric"]]
  (defmethod build-filter [:verified model]
    [_filter model query verified]
    (if (nil? verified)
      query
      (do
        (assert (true? verified) "filter for non-verified cards is not supported")
        (if (premium-features/has-feature? :content-verification)
          (-> query
              (sql.helpers/join :moderation_review
                                [:= :moderation_review.moderated_item_id
                                 (search.config/column-with-alias model :id)])
              (sql.helpers/where [:= :moderation_review.status "verified"]
                                 [:= :moderation_review.moderated_item_type "card"]
                                 [:= :moderation_review.most_recent true]))
          (sql.helpers/where query false-clause))))))

;; created-at filters

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

(doseq [model ["collection" "database" "table" "dashboard" "card" "dataset" "metric" "action"]]
  (defmethod build-filter [:created-at model]
    [_filter model query created-at]
    (cond-> query
      created-at
      (sql.helpers/where (date-range-filter-clause
                          (search.config/column-with-alias model :created_at)
                          created-at)))))

;; last-edited-by filter

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

(defn search-model->revision-model
  "Return the apporpriate revision model given a search model."
  [model]
  (case model
    "dataset" (recur "card")
    (str/capitalize model)))

(doseq [model ["dashboard" "card" "dataset" "metric"]]
  (defmethod build-filter [:last-edited-by model]
    [_filter model query editor-ids]
    (if (empty? editor-ids)
      query
      (cond-> query
        ;; both last-edited-by and last-edited-at join with revision, so we should be careful not to join twice
        (not (joined-with-table? query :join :revision))
        (-> (sql.helpers/join :revision [:= :revision.model_id (search.config/column-with-alias model :id)])
            (sql.helpers/where [:= :revision.most_recent true]
                               [:= :revision.model (search.config/search-model->revision-model model)]))
        (= 1 (count editor-ids))
        (sql.helpers/where [:= :revision.user_id (first editor-ids)])

        (> (count editor-ids) 1)
        (sql.helpers/where [:in :revision.user_id editor-ids])))))

;; last-edited-at filter

(doseq [model ["dashboard" "card" "dataset" "metric"]]
  (defmethod build-filter [:last-edited-at model]
    [_filter model query last-edited-at]
    (if-not last-edited-at
      query
      (cond-> query
        ;; both last-edited-by and last-edited-at join with revision, so we should be careful not to join twice
        (not (joined-with-table? query :join :revision))
        (-> (sql.helpers/join :revision [:= :revision.model_id (search.config/column-with-alias model :id)])
            (sql.helpers/where [:= :revision.most_recent true]
                               [:= :revision.model (search.config/search-model->revision-model model)]))
        true
        ;; on UI we showed the the last edit info from revision.timestamp
        ;; not the model.updated_at column
        ;; to be consistent we use revision.timestamp to do the filtering
        (sql.helpers/where (date-range-filter-clause :revision.timestamp last-edited-at))))))

;; TODO: once we record revision for actions, we should update this to use the same approach with dashboard/card
(defmethod build-filter [:last-edited-at "action"]
  [_filter model query last-edited-at]
  (cond-> query
    last-edited-at
    (sql.helpers/where query (date-range-filter-clause
                              (search.config/column-with-alias model :updated_at)
                              last-edited-at))))

(defn- optional-filters->supported-models []
  (->> (dissoc (methods build-filter) :default)
       keys
       (reduce (fn [acc [filter model]]
                 (update acc filter set/union #{model}))
               {})))

(defn- feature->supported-models
  "Return A map of filter to its support models.

  E.g: {:created-by #{\"card\" \"dataset\" \"dashboard\" \"action\"}}

  This is function instead of a def so that optional-filter-clause can be defined anywhere in the codebase."
  []
  (merge
   ;; models support search-native-query if the model has a native query column
   {:search-native-query (->> (dissoc (methods search.config/native-query-columns) :default)
                              (map first)
                              set)}
   (optional-filters->supported-models)))

;; ------------------------------------------------------------------------------------------------;;
;;                                        Public functions                                         ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defn search-context->applicable-models :- [:set SearchableModel]
  "Returns a set of models that are applicable given the search context.

  If the context has optional filters, the models will be restricted for the set of supported models only."
  [search-context :- SearchContext]
  (let [{:keys [archived
                created-at
                created-by
                last-edited-at
                last-edited-by
                models
                search-native-query
                verified]}        search-context
        feature->supported-models (feature->supported-models)]
    (cond-> models
      (some? archived)            (set/intersection (:archived feature->supported-models))
      (some? created-at)          (set/intersection (:created-at feature->supported-models))
      (some? created-by)          (set/intersection (:created-by feature->supported-models))
      (some? last-edited-at)      (set/intersection (:last-edited-at feature->supported-models))
      (some? last-edited-by)      (set/intersection (:last-edited-by feature->supported-models))
      (true? verified)            (set/intersection (:verified feature->supported-models))
      (true? search-native-query) (set/intersection (:search-native-query feature->supported-models)))))

(mu/defn build-filters :- :map
  "Build the search filters for a model."
  [query          :- :map
   model          :- SearchableModel
   search-context :- SearchContext]
  (let [filters (keys (optional-filters->supported-models))]
    (reduce (fn [q filter]
              (let [v (get search-context filter)]
                (build-filter filter model q v)))
            query
            filters)))
