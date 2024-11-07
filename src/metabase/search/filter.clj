(ns metabase.search.filter
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.driver.common.parameters.dates :as params.dates]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.in-place.filter :as search.in-place.filter]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.time LocalDate)))

(def ^:private context-key->attr
  {:archived?           :archived
   :created-at          :created-at
   :created-by          :creator-id
   :last-edited-at      :last-edited-at
   :last-edited-by      :last-editor-id
   :search-native-query :dataset-query
   ;; this actually has nothing to do with tables anymore, as we also filter cards.
   :table-db-id         :database-id
   :verified            :verified})

(def ^:private attr->index-key
  (into {} (for [k (vals context-key->attr)]
             [k (keyword (str "search_index." (u/->snake_case_en (name k))))])))

(defn- remove-if-falsey [m k]
  (if (m k) m (dissoc m k)))

(defn search-context->applicable-models
  "Returns a set of models that are applicable given the search context.

  If the context has optional filters, the models will be restricted for the set of supported models only."
  [search-ctx]
  (if (= :search.engine/in-place (:search-engine search-ctx))
    (search.in-place.filter/search-context->applicable-models search-ctx)
    ;; Archived is an eccentric one - we treat it as false for models that don't map it
    (let [required (->> (remove-if-falsey search-ctx :archived?) keys (keep context-key->attr))]
      (into #{}
            (remove nil?)
            (for [search-model (:models search-ctx)
                  :let [spec (search.spec/spec search-model)]]
              (when (every? (:attrs spec) required)
                (:name spec)))))))

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

(defmulti ^:private where-clause* (fn [context-key _column _v] context-key))

(defmethod where-clause* :archived? [_ k v] [:= k v])

(defmethod where-clause* :created-at [_ k v] (date-range-filter-clause k v))

(defmethod where-clause* :created-by [_ k v] [:in k v])

(defmethod where-clause* :last-edited-at [_ k v] (date-range-filter-clause k v))

(defmethod where-clause* :last-edited-by [_ k v] [:in k v])

(defmethod where-clause* :table-db-id [_ k v] [:= k v])

(defmethod where-clause* :verified [_ k v]
  (assert (true? v) "filter for non-verified cards is not supported")
  (when (premium-features/has-feature? :content-verification)
    [:= k v]))

(def ^:private false-clause
  [:inline [:= 0 1]])

(assert (= (disj (set (keys context-key->attr)) :search-native-query)
           (set (keys (methods where-clause*))))
        "All filters have been implemented.")

(defn with-filters
  "Return a HoneySQL clause corresponding to all the optional search filters."
  [search-context qry]
  (as-> qry qry
    (sql.helpers/where qry (when (seq (:models search-context))
                             [:in :model (:models search-context)]))
    (sql.helpers/where qry (when-let [ids (:ids search-context)]
                             [:and
                              [:in :model_id ids]
                              ;; NOTE: we limit id-based search to only a subset of the models
                              ;; TODO this should just become part of the spec e.g. :search-by-id?
                              [:in :model ["card" "dataset" "metric" "dashboard" "action"]]]))
    (reduce (fn [qry [ctx-key attr-key]]
              (let [v (get search-context ctx-key)]
                (if (some? v)
                  (sql.helpers/where qry (or (where-clause* ctx-key (attr->index-key attr-key) v) false-clause))
                  qry)))
            qry
            (dissoc context-key->attr :search-native-query))))
