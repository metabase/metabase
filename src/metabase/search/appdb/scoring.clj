(ns metabase.search.appdb.scoring
  (:require
   [clojure.core.memoize :as memoize]
   [honey.sql.helpers :as sql.helpers]
   [metabase.config.core :as config]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.scoring :as search.scoring]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; TODO move these to the spec definitions
(def ^:private bookmarked-models [:card :collection :dashboard])

(def ^:private sub-models {:card [:card :metric :dataset]})

(def ^:private bookmark-score-expr
  (let [match-clause (fn [m] [[:and
                               (if-let [sms (sub-models (keyword m))]
                                 [:in :search_index.model (mapv (fn [k] [:inline (name k)]) sms)]
                                 [:= :search_index.model [:inline m]])
                               [:!= nil (keyword (str m "_bookmark." m "_id"))]]
                              [:inline 1]])]
    (into [:case] (concat (mapcat (comp match-clause name) bookmarked-models) [:else [:inline 0]]))))

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
    (search.scoring/size :view_count (if (seq cases)
                                       (into [:case] cat cases)
                                       1))))

(defmethod search.engine/scorers :search.engine/appdb
  [{:keys [limit-int] :as search-ctx}]
  (merge
   (search.scoring/base-scorers search-ctx)
   (if (and limit-int (zero? limit-int))
     {:model       [:inline 1]}
     ;; NOTE: we calculate scores even if the weight is zero, so that it's easy to consider how we could affect any
     ;; given set of results. At some point, we should optimize away the irrelevant scores for any given context.
     {:text         (specialization/text-score)
      :view-count   (view-count-expr search.config/view-count-scaling-percentile)
      :bookmarked   bookmark-score-expr})))

(defn- bookmark-join [model user-id]
  (let [model-name (name model)
        table-name (str model-name "_bookmark")]
    [(keyword table-name)
     [:and
      (if-let [sms (sub-models model)]
        [:in :search_index.model (mapv (fn [m] [:inline (name m)]) sms)]
        [:= :search_index.model [:inline model-name]])
      [:= (keyword (str table-name ".user_id")) user-id]
      [:= :search_index.model_id [:cast (keyword (str table-name "." model-name "_id")) :text]]]]))

(defn- join-bookmarks [qry user-id]
  (apply sql.helpers/left-join qry (mapcat #(bookmark-join % user-id) bookmarked-models)))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [{:keys [current-user-id] :as search-ctx} scorers qry]
  (-> (search.scoring/with-scores search-ctx scorers qry)
      (join-bookmarks current-user-id)
      (sql.helpers/order-by [:total_score :desc])))
