(ns metabase.search.postgres.scoring
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.search.config :as search.config]))

(def ^:private seconds-in-a-day 86400)

(defn truthy
  "Prefer it when a (potentially nullable) boolean is true."
  [column]
  [:coalesce [:cast column :integer] [:inline 0]])

(defn size
  "Prefer items whose value is larger, up to some saturation point. Items beyond that point are equivalent."
  [column ceiling]
  [:least [:/ [:coalesce column [:inline 0]] [:inline (double ceiling)]] [:inline 1]])

(defn atan-size
  "Prefer items whose value is larger, with diminishing gains."
  [column scaling]
  ;; 2/PI * tan^-1 (x/N)
  [:*
   [:/ [:inline 2] [:pi]]
   [:atan [:/ [:cast [:coalesce column [:inline 0.0]] :float] [:inline scaling]]]])

(defn inverse-duration
  "Score at item based on the duration between two dates, where less is better."
  [from-column to-column ceiling-in-days]
  (let [ceiling [:inline ceiling-in-days]]
    [:/
     [:greatest
      [:- ceiling
       [:/
        ;; Use seconds for granularity in the fraction.
        [[:raw "EXTRACT(epoch FROM (" [:- to-column from-column] [:raw "))"]]]
        [:inline (double seconds-in-a-day)]]]
      [:inline 0]]
     ceiling]))

(defn idx-rank
  "Prefer items whose value is earlier in some list."
  [idx-col len]
  (if (pos? len)
    [:/ [:- [:inline (dec len)] idx-col] [:inline len]]
    [:inline 1]))

(defn- sum-columns [column-names]
  (if (seq column-names)
    (reduce (fn [expr col] [:+ expr col])
            (first column-names)
            (rest column-names))
    [:inline 1]))

(defn- weighted-score [[column-alias expr]]
  [:* [:inline (search.config/weight column-alias)] expr])

(defn- select-items [scorers]
  (concat
   (for [[column-alias expr] scorers]
     [expr column-alias])
   [[(sum-columns (map weighted-score scorers))
     :total_score]]))

;; Divides rank by log(len(doc))
;; See https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-RANKING
(def ^:private ts-rank-normalization 1)

;; TODO move these to the spec definitions
(def ^:private bookmarked-models [:card :collection :dashboard])

(def ^:private bookmark-score-expr
  (let [match-clause (fn [m] [[:and [:= :model m] [:!= nil (keyword (str m "_bookmark." m "_id"))]]
                              [:inline 1]])]
    (into [:case] (concat (mapcat (comp match-clause name) bookmarked-models) [:else [:inline 0]]))))

(def base-scorers
  "The default constituents of the search ranking scores."
  {:text       [:ts_rank :search_vector :query [:inline ts-rank-normalization]]
   :view-count (atan-size :view_count search.config/view-count-scaling)
   :pinned     (truthy :pinned)
   :bookmarked bookmark-score-expr
   :recency    (inverse-duration :model_updated_at [:now] search.config/stale-time-in-days)
   :dashboard  (size :dashboardcard_count search.config/dashboard-count-ceiling)
   :model      (idx-rank :model_rank (count search.config/all-models))})

(defenterprise scorers
  "Return the select-item expressions used to calculate the score for each search result."
  metabase-enterprise.search.scoring
  []
  base-scorers)

(defn- scorer-select-items [] (select-items (scorers)))

(defn- bookmark-join [model user-id]
  (let [model-name (name model)
        table-name (str model-name "_bookmark")]
    [(keyword table-name)
     [:and
      [:= :model [:inline model-name]]
      [:= (keyword (str table-name ".user_id")) user-id]
      [:= :search_index.model_id (keyword (str table-name "." model-name "_id"))]]]))

(defn- join-bookmarks [qry user-id]
  (apply sql.helpers/left-join qry (mapcat #(bookmark-join % user-id) bookmarked-models)))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [search-ctx qry]
  (-> (apply sql.helpers/select qry (scorer-select-items))
      (join-bookmarks (:current-user-id search-ctx))
      (sql.helpers/order-by [:total_score :desc])))
