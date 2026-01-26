(ns metabase.search.config
  (:require
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.search.settings :as search.settings]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:dynamic *db-max-results*
  "Number of raw results to fetch from the database. This number is in place to prevent massive application DB load by
  returning tons of results; this number should probably be adjusted downward once we have UI in place to indicate
  that results are truncated.

  Under normal situations it shouldn't be rebound, but it's dynamic to make unit testing easier."
  1000)

(def ^:const max-filtered-results
  "Number of results to return in an API response"
  1000)

(def ^:const stale-time-in-days
  "Results older than this number of days are all considered to be equally old. In other words, there is a ranking
  bonus for results newer than this (scaled to just how recent they are). c.f. `search.scoring/recency-score`"
  30)

(def ^:const dashboard-count-ceiling
  "Results in more dashboards than this are all considered to be equally popular."
  10)

(def ^:const view-count-scaling-percentile
  "The percentile of the given search model's view counts, to be multiplied by [[view-count-scaling]].
  The larger this value, the longer it will take for the score to approach 1.0. It will never quite reach it."
  0.99)

(def ^:const surrounding-match-context
  "Show this many words of context before/after matches in long search results"
  2)

(def model->db-model
  "Mapping of model name to :db_model and :alias"
  (cond-> api/model->db-model
    config/ee-available? (assoc "transform" {:db-model :model/Transform :alias :transform})))

;; We won't need this once fully migrated to specs, but kept for now in case legacy cod falls out of sync
(def excluded-models
  "Set of models that should not be included in search results."
  #{"dashboard-card"
    "dashboard-tab"
    "dimension"
    "permissions-group"
    "pulse"
    "pulse-card"
    "pulse-channel"
    "snippet"
    "timeline"
    "user"})

;; TODO we could almost replace this using the spec, but there are two blockers
;; - We do not cover index-entity yet
;; - We also need to provide an alias (and this must match the API one for legacy)
(def model-to-db-model
  "Mapping from string model to the Toucan model backing it."
  (apply dissoc model->db-model excluded-models))

(def all-models
  "Set of all valid models to search for. "
  (set (keys model-to-db-model)))

(def models-search-order
  "The order of this list influences the order of the results: items earlier in the
  list will be ranked higher."
  (cond-> ["dashboard" "metric" "segment" "measure" "indexed-entity" "card" "dataset" "collection" "table" "action" "document"]
    config/ee-available? (concat ["transform"])
    :always (conj "database")))

(assert (= all-models (set models-search-order)) "The models search order has to include all models")

(def static-weights
  "Strength of the various scorers."
  {:default
   {:pinned              0
    :bookmarked          1
    :recency             1
    :user-recency        5
    :dashboard           0
    :model               2
    :official-collection 1
    :verified            1
    :view-count          2
    :text                5
    :mine                1
    :exact               5
    :prefix              0
    ;; RRF is the "Reciprocal Rank Fusion" score used by the semantic search backend to blend semantic and keyword scores
    :rrf                 500}
   :command-palette
   {:prefix               5
    :model/collection     1
    :model/dashboard      1
    :model/metric         1
    :model/dataset        0.8
    :model/table          0.8
    :model/indexed-entity 0.5
    :model/database       0.5
    :model/question       0}
   :entity-picker
   {:model/table    1
    :model/dataset  1
    :model/metric   1
    :model/question 0}})

(def ^:private FilterDef
  "A relaxed definition, capturing how we can write the filter - with some fields omitted."
  [:map {:closed true}
   [:key                               :keyword]
   [:type                              :keyword]
   [:field            {:optional true} :string]
   [:context-key      {:optional true} :keyword]
   [:supported-value? {:optional true} ifn?]
   [:required-feature {:optional true} :keyword]
   [:engine           {:optional true} :keyword]])

(def ^:private Filter
  "A normalized representation, for the application to leverage."
  [:map {:closed true}
   [:key              :keyword]
   [:type             :keyword]
   [:field            :string]
   [:context-key      :keyword]
   [:supported-value? ifn?]
   [:required-feature [:maybe :keyword]]
   [:engine           [:maybe :keyword]]])

(mu/defn- build-filter :- Filter
  [{k :key t :type :keys [context-key field supported-value? required-feature engine]} :- FilterDef]
  {:key              k
   :type             (keyword "metabase.search.filter" (name t))
   :field            (or field (u/->snake_case_en (name k)))
   :context-key      (or context-key k)
   :supported-value? (or supported-value? (constantly true))
   :required-feature required-feature
   :engine           (or engine :all)})

(mu/defn- build-filters :- [:map-of :keyword Filter]
  [m]
  (-> (reduce #(assoc-in %1 [%2 :key] %2) m (keys m))
      (update-vals build-filter)))

(def filters
  "Specifications for the optional search filters."
  (build-filters
   {:archived                {:type :single-value, :context-key :archived?}
    :collection-id           {:type :collection-hierarchy, :context-key :collection}
    ;; TODO dry this alias up with the index hydration code
    :created-at              {:type :date-range, :field "model_created_at"}
    :creator-id              {:type :list, :context-key :created-by}
    ;; This actually has nothing to do with tables, as we also filter cards, it would be good to rename the context key.
    :database-id             {:type :single-value, :context-key :table-db-id}
    :id                      {:type :list, :context-key :ids, :field "model_id"}
    :last-edited-at          {:type :date-range}
    :last-editor-id          {:type :list, :context-key :last-edited-by}
    :native-query            {:type :native-query, :context-key :search-native-query}
    :verified                {:type :single-value, :supported-value? #{true}, :required-feature :content-verification}
    :non-temporal-dim-ids    {:type :single-value :engine :appdb}
    :has-temporal-dim        {:type :single-value :engine :appdb}
    :display-type            {:type :list, :field "display_type"}}))

(def ^:private filter-defaults-by-context
  {:default         {:archived               false
                     ;; keys will typically those in [[filters]], but this is an atypical filter.
                     ;; we plan to generify it, by precalculating it on the index.
                     :filter-items-in-personal-collection "all"}
   :search-app      {:filter-items-in-personal-collection "exclude-others"}
   :command-palette {:filter-items-in-personal-collection "exclude-others"}})

(defn filter-default
  "Get the default value for the given filter in the given context. Is non-contextual for legacy search."
  [engine context filter-key]
  (let [fetch (fn [ctx] (when ctx (-> filter-defaults-by-context (get ctx) (get filter-key))))]
    (if (= engine :search.engine/in-place)
      (fetch :default)
      (or (fetch context) (fetch :default)))))

;; This gets called *a lot* during a search request, so we'll almost certainly need to optimize it. Maybe just TTL.
(defn weights
  "Strength of the various scorers. Copied from metabase.search.in-place.scoring, but allowing divergence."
  ([]
   (weights {}))
  ([{request-overrides :weights, :keys [context]}]
   (let [context          (or context :default)
         system-overrides (search.settings/experimental-search-weight-overrides)]
     (if (= :all context)
       (merge-with merge static-weights system-overrides)
       (merge (get static-weights :default)
              ;; Not sure which of the next two should have precedence, arguments for both "¯\_(ツ)_/¯"
              (get system-overrides :default)
              (get static-weights context)
              (get system-overrides context)
              request-overrides)))))

(defn weight
  "The relative strength the corresponding score has in influencing the total score."
  [search-ctx scorer-key]
  (get (weights search-ctx) scorer-key (when-not (namespace scorer-key) 0)))

(defn scorer-param
  "Get a nested parameter scoped to the given scorer"
  [search-ctx scorer-key param-key]
  (let [flat-key (keyword (name scorer-key) (name param-key))]
    (weight search-ctx flat-key)))

(defn model->alias
  "Given a model string returns the model alias"
  [model]
  (-> model model-to-db-model :alias))

(mu/defn column-with-model-alias :- keyword?
  "Given a column and a model name, Return a keyword representing the column with the model alias prepended.

  (column-with-model-alias \"card\" :id) => :card.id)"
  [model-string :- ms/KeywordOrString
   column       :- ms/KeywordOrString]
  (keyword (str (name (model->alias model-string)) "." (name column))))

(def SearchableModel
  "Schema for searchable models"
  (into [:enum] all-models))

(def SearchContext
  "Map with the various allowed search parameters, used to construct the SQL query."
  [:map {:closed true}
   ;; display related
   [:calculate-available-models? {:optional true} :boolean]
   ;;
   ;; required
   ;;
   [:archived?          [:maybe :boolean]]
   [:current-user-id    pos-int?]
   [:is-superuser?      :boolean]
   [:is-data-analyst?   :boolean]
   ;; TODO only optional and maybe for tests, clean that up!
   [:context               {:optional true} [:maybe :keyword]]
   [:is-impersonated-user? {:optional true} [:maybe :boolean]]
   [:is-sandboxed-user?    {:optional true} [:maybe :boolean]]
   [:current-user-perms [:set perms/PathSchema]]

   [:model-ancestors?   :boolean]
   [:models             [:set SearchableModel]]
   ;; TODO this is optional only for tests, clean those up!
   [:search-engine      {:optional true} keyword?]
   [:search-string      {:optional true} [:maybe ms/NonBlankString]]
   [:weights            {:optional true} [:maybe [:map-of :keyword number?]]]
   ;;
   ;; optional
   ;;
   [:collection                          {:optional true} [:maybe ms/PositiveInt]]
   [:created-at                          {:optional true} ms/NonBlankString]
   [:created-by                          {:optional true} [:set {:min 1} ms/PositiveInt]]
   [:display-type                        {:optional true} [:set {:min 1} ms/NonBlankString]]
   [:filter-items-in-personal-collection {:optional true} [:enum "all" "only" "only-mine" "exclude" "exclude-others"]]
   [:last-edited-at                      {:optional true} ms/NonBlankString]
   [:last-edited-by                      {:optional true} [:set {:min 1} ms/PositiveInt]]
   [:limit-int                           {:optional true} ms/Int]
   [:offset-int                          {:optional true} ms/Int]
   [:search-native-query                 {:optional true} :boolean]
   [:table-db-id                         {:optional true} ms/PositiveInt]
   ;; true to search for verified items only, nil will return all items
   [:verified                            {:optional true} true?]
   [:ids                                 {:optional true} [:set {:min 1} ms/PositiveInt]]
   [:include-dashboard-questions?        {:optional true} :boolean]
   [:include-metadata?                   {:optional true} :boolean]
   [:non-temporal-dim-ids                {:optional true} ms/NonBlankString]
   [:has-temporal-dim                    {:optional true} :boolean]])

(defmulti column->string
  "Turn a complex column into a string"
  {:arglists '([column-value model column-name])}
  (fn [_column-value model column-name]
    [(keyword model) column-name]))

(defmethod column->string :default
  [value _ _]
  value)

(defmethod column->string [:card :dataset_query]
  [value _ _]
  (or (when-let [query (not-empty ((lib-be/transform-query :out) value))]
        (when (lib/native-only-query? query)
          (lib/raw-native-query query)))
      ""))
