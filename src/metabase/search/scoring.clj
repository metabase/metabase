(ns metabase.search.scoring
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.search.config :as search.config]
   [metabase.util.honey-sql-2 :as h2x]))

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
  "Score an item based on the duration between two dates, where less is better."
  ([from-column to-column ceiling-in-days]
   (inverse-duration (mdb/db-type) from-column to-column ceiling-in-days))
  ([db-type from-column to-column ceiling-in-days]
   (let [ceiling [:inline ceiling-in-days]]
     [:/
      [:greatest
       [:- ceiling
        [:/
         ;; Use seconds for granularity in the fraction.
         (if (= :mysql db-type)
           [:coalesce
            [[:timestampdiff [:raw "SECOND"] from-column to-column]]
            [:* ceiling (double seconds-in-a-day)]]
           [[:raw "EXTRACT(epoch FROM (" [:- to-column from-column] [:raw "))"]]])
         [:inline (double seconds-in-a-day)]]]
       [:inline 0]]
      ceiling])))

(defn- cast-to-text
  [column]
  [:cast column (if (= :mysql (mdb/db-type))
                  :char
                  :text)])

(defn user-recency-expr
  "Expression to select the `:user-recency` timestamp for the `current-user-id`."
  [{:keys [current-user-id]}]
  (let [one-day-ago (h2x/add-interval-honeysql-form (mdb/db-type) :%now -1 :day)]
    {:select [[[:case
                ;; Transforms get a hardcoded 1-day last_viewed_at because we don't track views on them
                [:= :search_index.model [:inline "transform"]]
                one-day-ago
                :else
                [:max :recent_views.timestamp]]
               :last_viewed_at]]
     :from   [:recent_views]
     :where  [:and
              [:= :recent_views.user_id current-user-id]
              [:= (cast-to-text :recent_views.model_id) :search_index.model_id]
              [:= :recent_views.model
               [:case
                [:= :search_index.model [:inline "dataset"]] [:inline "card"]
                [:= :search_index.model [:inline "metric"]] [:inline "card"]
                :else :search_index.model]]]}))

(defn model-rank-expr
  "Score an item based on its :model type."
  [search-ctx]
  (let [search-order search.config/models-search-order
        n            (double (count search-order))
        cases        (map-indexed (fn [i sm]
                                    [[:= :search_index.model sm]
                                     (or (search.config/scorer-param search-ctx :model sm)
                                         [:inline (/ (- n i) n)])])
                                  search-order)]
    (-> (into [:case] cat (concat cases))
        ;; if you're not listed, get a very poor score
        (into [:else [:inline 0.01]]))))

;; TODO move these to the spec definitions
(def ^:private bookmarked-models [:card :collection :dashboard])

(def ^:private bookmarked-sub-models {:card [:card :metric :dataset]})

(def bookmarked-models-and-sub-models
  "Set that is the union of all bookmarked-models and bookmarked-sub-models"
  (into (set bookmarked-models) cat (vals bookmarked-sub-models)))

(def bookmark-score-expr
  "Score an item based on whether it has been bookmarked."
  (let [match-clause (fn [m] [[:and
                               (if-let [sms (bookmarked-sub-models (keyword m))]
                                 [:in :search_index.model (mapv (fn [k] [:inline (name k)]) sms)]
                                 [:= :search_index.model [:inline m]])
                               [:!= nil (keyword (str m "_bookmark." m "_id"))]]
                              [:inline 1]])]
    (into [:case] (concat (mapcat (comp match-clause name) bookmarked-models) [:else [:inline 0]]))))

(defn- bookmark-join [model user-id]
  (let [model-name (name model)
        table-name (str model-name "_bookmark")]
    [(keyword table-name)
     [:and
      (if-let [sms (bookmarked-sub-models model)]
        [:in :search_index.model (mapv (fn [m] [:inline (name m)]) sms)]
        [:= :search_index.model [:inline model-name]])
      [:= (keyword (str table-name ".user_id")) user-id]
      [:= :search_index.model_id (cast-to-text (keyword (str table-name "." model-name "_id")))]]]))

(defn join-bookmarks
  "Add join clause to bookmark tables for :bookmarked scorer."
  [qry user-id]
  (apply sql.helpers/left-join qry (mapcat #(bookmark-join % user-id) bookmarked-models)))

(defn sum-columns
  "Sum the columns in `column-names`."
  [column-names]
  (if (seq column-names)
    (reduce (fn [expr col] [:+ expr col])
            (first column-names)
            (rest column-names))
    [:inline 1]))

(defn weighted-score
  "Multiply a score by its weight."
  [search-ctx [column-alias expr]]
  [:* [:inline (search.config/weight search-ctx column-alias)] expr])

(defn select-items
  "Select expressions for each scorer, plus a :total_score that is the weighted sum of the `scorers`."
  [search-ctx scorers]
  (concat
   (for [[column-alias expr] scorers]
     [expr column-alias])
   [[(sum-columns (map (partial weighted-score search-ctx) scorers))
     :total_score]]))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores."
  [search-ctx scorers qry]
  (apply sql.helpers/select qry (select-items search-ctx scorers)))

(defn all-scores
  "Scoring stats for each `index-row`."
  [weights scorers index-row]
  (mapv (fn [k]
          (let [score  (or (get index-row k) 0)
                weight (or (weights k) 0)]
            {:score        score
             :name         k
             :weight       weight
             :contribution (* weight score)}))
        scorers))

(defn no-scoring-required?
  "Scoring is unnecessary when we are not returning any results, e.g. counting potential results"
  [{:keys [limit-int]}]
  (and limit-int (zero? limit-int)))
