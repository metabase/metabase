(ns metabase.search.config
  (:require
   [cheshire.core :as json]
   [metabase.api.common :as api]
   [metabase.models.setting :refer [defsetting]]
   [metabase.permissions.util :as perms.u]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(defsetting search-typeahead-enabled
  (deferred-tru "Enable typeahead search in the {0} navbar?"
                (public-settings/application-name-for-setting-descriptions))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :export?    true
  :audit      :getter)

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
  180)

(def ^:const dashboard-count-ceiling
  "Results in more dashboards than this are all considered to be equally popular."
  50)

(def ^:const surrounding-match-context
  "Show this many words of context before/after matches in long search results"
  2)

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
  (apply dissoc api/model->db-model excluded-models))

(def all-models
  "Set of all valid models to search for. "
  (set (keys model-to-db-model)))

(def models-search-order
  "The order of this list influences the order of the results: items earlier in the
  list will be ranked higher."
  ["dashboard" "metric" "segment" "indexed-entity" "card" "dataset" "collection" "table" "action" "database"])

(assert (= all-models (set models-search-order)) "The models search order has to include all models")

(def weights
  "Strength of the various scorers. Copied from metabase.search.in-place.scoring, but allowing divergence."
  {:pinned              2                                   ;; simple field
   :bookmarked          2                                   ;; join with multi-table entity
   :recency             1.5                                 ;; date formula
   :dashboard           1                                   ;; simple field
   :model               0.5                                 ;; simple field
   :official-collection 2                                   ;; a field we can calculate
   :verified            2                                   ;; a simple field
   :text                10                                  ;; strength of text-scores-weight previously
   })

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
   [:current-user-perms [:set perms.u/PathSchema]]
   [:model-ancestors?   :boolean]
   [:models             [:set SearchableModel]]
   ;; TODO this is optional only for tests, clean those up!
   [:search-engine      {:optional true} keyword?]
   [:search-string      {:optional true} [:maybe ms/NonBlankString]]
   ;;
   ;; optional
   ;;
   [:created-at                          {:optional true} ms/NonBlankString]
   [:created-by                          {:optional true} [:set {:min 1} ms/PositiveInt]]
   [:filter-items-in-personal-collection {:optional true} [:enum "only" "exclude"]]
   [:last-edited-at                      {:optional true} ms/NonBlankString]
   [:last-edited-by                      {:optional true} [:set {:min 1} ms/PositiveInt]]
   [:limit-int                           {:optional true} ms/Int]
   [:offset-int                          {:optional true} ms/Int]
   [:search-native-query                 {:optional true} true?]
   [:table-db-id                         {:optional true} ms/PositiveInt]
   ;; true to search for verified items only, nil will return all items
   [:verified                            {:optional true} true?]
   [:ids                                 {:optional true} [:set {:min 1} ms/PositiveInt]]])

(defmulti column->string
  "Turn a complex column into a string"
  (fn [_column-value model column-name]
    [(keyword model) column-name]))

(defmethod column->string :default
  [value _ _]
  value)

(defmethod column->string [:card :dataset_query]
  [value _ _]
  (let [query (json/parse-string value true)]
    (if (= "native" (:type query))
      (-> query :native :query)
      "")))
