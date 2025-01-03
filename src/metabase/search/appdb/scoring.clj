(ns metabase.search.appdb.scoring
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.config :as config]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.config :as search.config]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private seconds-in-a-day 86400)

(defn truthy
  "Prefer it when a (potentially nullable) boolean is true."
  [column]
  [:coalesce [:cast column :integer] [:inline 0]])

(defn equal
  "Prefer it when it matches a specific (non-null) value"
  [column value]
  [:coalesce [:case [:= column value] [:inline 1] :else [:inline 0]] [:inline 0]])

(defn prefix
  "Prefer it when the given value is a completion of a specific (non-null) value"
  [column value]
  [:coalesce [:case [:like column (str (str/replace value "%" "%%") "%")] [:inline 1] :else [:inline 0]] [:inline 0]])

(defn size
  "Prefer items whose value is larger, up to some saturation point. Items beyond that point are equivalent."
  [column ceiling]
  [:least
   [:inline 1]
   [:/
    [:coalesce column [:inline 0]]
    ;; protect against div / 0
    [:greatest
     [:inline 1]
     (if (number? ceiling)
       [:inline (double ceiling)]
       [:cast ceiling :float])]]])

(defn inverse-duration
  "Score at item based on the duration between two dates, where less is better."
  [from-column to-column ceiling-in-days]
  (let [ceiling [:inline ceiling-in-days]]
    [:/
     [:greatest
      [:- ceiling
       [:/
        ;; Use seconds for granularity in the fraction.
        ;; TODO will probably need to specialize this based on (mdb/db-type)
        [[:raw "EXTRACT(epoch FROM (" [:- to-column from-column] [:raw "))"]]]
        [:inline (double seconds-in-a-day)]]]
      [:inline 0]]
     ceiling]))

(defn idx-rank
  "Prefer items whose value is earlier in some list."
  [idx-col len]
  (if (pos? len)
    [:/ [:- [:inline (dec len)] idx-col] [:inline (double len)]]
    [:inline 1]))

(defn- sum-columns [column-names]
  (if (seq column-names)
    (reduce (fn [expr col] [:+ expr col])
            (first column-names)
            (rest column-names))
    [:inline 1]))

(defn- weighted-score [context [column-alias expr]]
  [:* [:inline (search.config/weight context column-alias)] expr])

(defn- select-items [context scorers]
  (concat
   (for [[column-alias expr] scorers]
     [expr column-alias])
   [[(sum-columns (map (partial weighted-score context) scorers))
     :total_score]]))

;; TODO move these to the spec definitions
(def ^:private bookmarked-models [:card :collection :dashboard])

(def ^:private bookmark-score-expr
  (let [match-clause (fn [m] [[:and
                               [:= :search_index.model [:inline m]]
                               [:!= nil (keyword (str m "_bookmark." m "_id"))]]
                              [:inline 1]])]
    (into [:case] (concat (mapcat (comp match-clause name) bookmarked-models) [:else [:inline 0]]))))

(defn- user-recency-expr [{:keys [current-user-id]}]
  {:select [[[:max :recent_views.timestamp] :last_viewed_at]]
   :from   [:recent_views]
   :where  [:and
            [:= :recent_views.user_id current-user-id]
            [:= :recent_views.model_id :search_index.model_id]
            [:= :recent_views.model
             [:case
              [:= :search_index.model [:inline "dataset"]] [:inline "card"]
              [:= :search_index.model [:inline "metric"]] [:inline "card"]
              :else :search_index.model]]]})

(defn- view-count-percentiles*
  [p-value]
  (into {} (for [{:keys [model vcp]} (t2/query (specialization/view-count-percentile-query
                                                (search.index/active-table)
                                                p-value))]
             [(keyword model) vcp])))

(def ^{:private true
       :arglists '([p-value])}
  view-count-percentiles
  (if config/is-prod?
    (memoize/ttl view-count-percentiles*
                 :ttl/threshold (u/hours->ms 1))
    view-count-percentiles*))

(defn- view-count-expr [percentile]
  (let [views (view-count-percentiles percentile)
        cases (for [[sm v] views]
                [[:= :search_index.model [:inline (name sm)]] (max (or v 0) 1)])]
    (size :view_count (if (seq cases)
                        (into [:case] cat cases)
                        1))))

(defn- model-rank-exp [{:keys [context]}]
  (let [search-order search.config/models-search-order
        n            (double (count search-order))
        cases        (map-indexed (fn [i sm]
                                    [[:= :search_index.model sm]
                                     (or (search.config/scorer-param context :model sm)
                                         [:inline (/ (- n i) n)])])
                                  search-order)]
    (-> (into [:case] cat (concat cases))
        ;; if you're not listed, get a very poor score
        (into [:else [:inline 0.01]]))))

(defn base-scorers
  "The default constituents of the search ranking scores."
  [{:keys [search-string limit-int] :as search-ctx}]
  (if (and limit-int (zero? limit-int))
    {:model       [:inline 1]}
    ;; NOTE: we calculate scores even if the weight is zero, so that it's easy to consider how we could affect any
    ;; given set of results. At some point, we should optimize away the irrelevant scores for any given context.
    {:text         (specialization/text-score)
     :view-count   (view-count-expr search.config/view-count-scaling-percentile)
     :pinned       (truthy :pinned)
     :bookmarked   bookmark-score-expr
     :recency      (inverse-duration [:coalesce :last_viewed_at :model_updated_at] [:now] search.config/stale-time-in-days)
     :user-recency (inverse-duration (user-recency-expr search-ctx) [:now] search.config/stale-time-in-days)
     :dashboard    (size :dashboardcard_count search.config/dashboard-count-ceiling)
     :model        (model-rank-exp search-ctx)
     :mine         (equal :search_index.creator_id (:current-user-id search-ctx))
     :exact        (if search-string
                     ;; perform the lower casing within the database, in case it behaves differently to our helper
                     (equal [:lower :search_index.name] [:lower search-string])
                     [:inline 0])
     :prefix       (if search-string
                     ;; in this case, we need to transform the string into a pattern in code, so forced to use helper
                     (prefix [:lower :search_index.name] (u/lower-case-en search-string))
                     [:inline 0])}))

(defenterprise scorers
  "Return the select-item expressions used to calculate the score for each search result."
  metabase-enterprise.search.scoring
  [search-ctx]
  (base-scorers search-ctx))

(defn- scorer-select-items [search-ctx scorers] (select-items (:context search-ctx) scorers))

(defn- bookmark-join [model user-id]
  (let [model-name (name model)
        table-name (str model-name "_bookmark")]
    [(keyword table-name)
     [:and
      [:= :search_index.model [:inline model-name]]
      [:= (keyword (str table-name ".user_id")) user-id]
      [:= :search_index.model_id (keyword (str table-name "." model-name "_id"))]]]))

(defn- join-bookmarks [qry user-id]
  (apply sql.helpers/left-join qry (mapcat #(bookmark-join % user-id) bookmarked-models)))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [{:keys [current-user-id] :as search-ctx} scorers qry]
  (-> (apply sql.helpers/select qry (scorer-select-items search-ctx scorers))
      (join-bookmarks current-user-id)
      (sql.helpers/order-by [:total_score :desc])))
