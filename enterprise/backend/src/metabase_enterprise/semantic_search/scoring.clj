(ns metabase-enterprise.semantic-search.scoring
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.config :as search.config]
   [metabase.search.scoring :as search.scoring]
   [toucan2.util :as u]))

(defn- ->col-expr
  "For a given `col-name` return a :coalesce expression to reference it from the outer hybrid search query.

   (->col-expr :model_id) -> [:coalesce :v.model_id :t.model_id]"
  [col-name]
  (let [prefix #(keyword (str %1 (name %2)))]
    [:coalesce (prefix "v." col-name) (prefix "t." col-name)]))

(defn- model-rank-exp [{:keys [context]}]
  (let [search-order search.config/models-search-order
        n            (double (count search-order))
        cases        (map-indexed (fn [i sm]
                                    [[:= (->col-expr :model) sm]
                                     (or (search.config/scorer-param context :model sm)
                                         [:inline (/ (- n i) n)])])
                                  search-order)]
    (-> (into [:case] cat (concat cases))
        ;; if you're not listed, get a very poor score
        (into [:else [:inline 0.01]]))))

(def ^:private rrf-rank-exp
  (let [k 60
        scale 100
        keyword-weight 0.51
        semantic-weight 0.49]
    [:* scale
     [:+
      [:* [:cast semantic-weight :float]
       [:coalesce [:/ 1.0 [:+ k [:. :v :semantic_rank]]] 0]]
      [:* [:cast keyword-weight :float]
       [:coalesce [:/ 1.0 [:+ k [:. :t :keyword_rank]]] 0]]]]))

(defn base-scorers
  "The default constituents of the search ranking scores."
  [{:keys [search-string limit-int] :as search-ctx}]
  (if (and limit-int (zero? limit-int))
    {:model       [:inline 1]}
    ;; NOTE: we calculate scores even if the weight is zero, so that it's easy to consider how we could affect any
    ;; given set of results. At some point, we should optimize away the irrelevant scores for any given context.
    {:rrf          rrf-rank-exp
     :pinned       (search.scoring/truthy (->col-expr :pinned))
     :recency      (search.scoring/inverse-duration [:coalesce
                                                     (->col-expr :last_viewed_at)
                                                     (->col-expr :model_updated_at)]
                                                    [:now]
                                                    search.config/stale-time-in-days)
     :dashboard    (search.scoring/size (->col-expr :dashboardcard_count) search.config/dashboard-count-ceiling)
     :model        (model-rank-exp search-ctx)
     :mine         (search.scoring/equal (->col-expr :creator_id) (:current-user-id search-ctx))
     :exact        (if search-string
                     ;; perform the lower casing within the database, in case it behaves differently to our helper
                     (search.scoring/equal [:lower (->col-expr :name)] [:lower search-string])
                     [:inline 0])
     :prefix       (if search-string
                     ;; in this case, we need to transform the string into a pattern in code, so forced to use helper
                     (search.scoring/prefix [:lower (->col-expr :name)] (u/lower-case-en search-string))
                     [:inline 0])}))

;; TODO EE version
(defn semantic-scorers
  "Return the select-item expressions used to calculate the score for semantic search results."
  [search-ctx]
  (base-scorers search-ctx))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [search-ctx scorers qry]
  (-> (search.scoring/with-scores search-ctx scorers qry)
      (sql.helpers/order-by [:total_score :desc])))
