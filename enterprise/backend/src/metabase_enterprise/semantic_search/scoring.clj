(ns metabase-enterprise.semantic-search.scoring
  (:require
   [clojure.core.memoize :as memoize]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.config :as search.config]
   [metabase.search.scoring :as search.scoring]
   [metabase.util :as u]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(defn- ->col-expr
  "For a given `col-name` return a :coalesce expression to reference it from the outer hybrid search query.

   (->col-expr :model_id) -> [:coalesce :v.model_id :t.model_id]"
  [col-name]
  (let [prefix #(keyword (str %1 (name %2)))]
    [:coalesce (prefix "v." col-name) (prefix "t." col-name)]))

(defn- view-count-percentile-query
  [index-table p-value]
  (let [expr [:raw "percentile_cont(" [:lift p-value] ") WITHIN GROUP (ORDER BY view_count)"]]
    {:select   [:search_index.model [expr :vcp]]
     :from     [[(keyword index-table) :search_index]]
     :group-by [:search_index.model]
     :having   [:is-not expr nil]}))

(defn- view-count-percentiles*
  [db index-table p-value]
  (into {} (for [{:keys [model vcp]}
                 (jdbc/execute! db
                                (-> (view-count-percentile-query
                                     index-table
                                     p-value)
                                    (sql/format {:quoted true}))
                                {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
             [(keyword model) vcp])))

(def ^{:private true
       :arglists '([db index-table p-value])}
  view-count-percentiles
  (if config/is-prod?
    (memoize/ttl view-count-percentiles*
                 :ttl/threshold (u/hours->ms 1))
    view-count-percentiles*))

(defn- view-count-expr [db index-table percentile]
  (let [views (view-count-percentiles db index-table percentile)
        cases (for [[sm v] views]
                [[:= (->col-expr :model) [:inline (name sm)]] (max (or v 0) 1)])]
    (search.scoring/size (->col-expr :view_count) (if (seq cases)
                                                    (into [:case] cat cases)
                                                    1))))

(defn- model-rank-exp [{:keys [context]}]
  (let [search-order search.config/models-search-order
        n (double (count search-order))
        cases (map-indexed (fn [i sm]
                             [[:= (->col-expr :model) sm]
                              (or (search.config/scorer-param context :model sm)
                                  [:inline (/ (- n i) n)])])
                           search-order)]
    (-> (into [:case] cat (concat cases))
        ;; if you're not listed, get a very poor score
        (into [:else [:inline 0.01]]))))

(def ^:private rrf-rank-exp
  (let [k 60
        keyword-weight 0.51
        semantic-weight 0.49]
    [:+
     [:* [:cast semantic-weight :float]
      [:coalesce [:/ 1.0 [:+ k [:. :v :semantic_rank]]] 0]]
     [:* [:cast keyword-weight :float]
      [:coalesce [:/ 1.0 [:+ k [:. :t :keyword_rank]]] 0]]]))

(defn base-scorers
  "The default constituents of the search ranking scores."
  [db index-table {:keys [search-string limit-int] :as search-ctx}]
  (if (and limit-int (zero? limit-int))
    {:model [:inline 1]}
    ;; NOTE: we calculate scores even if the weight is zero, so that it's easy to consider how we could affect any
    ;; given set of results. At some point, we should optimize away the irrelevant scores for any given context.
    {:rrf       rrf-rank-exp
     :view-count (view-count-expr db index-table search.config/view-count-scaling-percentile)
     :pinned     (search.scoring/truthy (->col-expr :pinned))
     :recency    (search.scoring/inverse-duration [:coalesce
                                                   (->col-expr :last_viewed_at)
                                                   (->col-expr :model_updated_at)]
                                                  [:now]
                                                  search.config/stale-time-in-days)
     :dashboard  (search.scoring/size (->col-expr :dashboardcard_count) search.config/dashboard-count-ceiling)
     :model      (model-rank-exp search-ctx)
     :mine       (search.scoring/equal (->col-expr :creator_id) (:current-user-id search-ctx))
     :exact      (if search-string
                   ;; perform the lower casing within the database, in case it behaves differently to our helper
                   (search.scoring/equal [:lower (->col-expr :name)] [:lower search-string])
                   [:inline 0])
     :prefix     (if search-string
                   ;; in this case, we need to transform the string into a pattern in code, so forced to use helper
                   (search.scoring/prefix [:lower (->col-expr :name)] (u/lower-case-en search-string))
                   [:inline 0])}))

(def ^:private enterprise-scorers
  {:official-collection {:expr (search.scoring/truthy (->col-expr :official_collection))
                         :pred #(premium-features/has-feature? :official-collections)}
   :verified            {:expr (search.scoring/truthy (->col-expr :verified))
                         :pred #(premium-features/has-feature? :content-verification)}})

(defn- additional-scorers
  "Which additional scorers are active?"
  []
  (into {}
        (keep (fn [[k {:keys [expr pred]}]]
                (when (pred)
                  [k expr])))
        enterprise-scorers))

(defn semantic-scorers
  "Return the select-item expressions used to calculate the score for semantic search results."
  [db index-table search-ctx]
  (merge (base-scorers db index-table search-ctx)
         (additional-scorers)))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [search-ctx scorers qry]
  (-> (search.scoring/with-scores search-ctx scorers qry)
      (sql.helpers/order-by [:total_score :desc])))

(defn all-scores
  "Score stats for each scorer"
  [weights scorers index-row]
  (search.scoring/all-scores weights scorers index-row))

(comment
  (def db @@(requiring-resolve 'metabase-enterprise.semantic-search.db/data-source))
  (def embedding-model ((requiring-resolve 'metabase-enterprise.semantic-search.embedding/get-configured-model)))
  (def index ((requiring-resolve 'metabase-enterprise.semantic-search.index/default-index) embedding-model))
  (def index-table (:table-name index)))
