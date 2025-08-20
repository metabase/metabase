(ns metabase-enterprise.semantic-search.scoring
  (:require
   [clojure.core.memoize :as memoize]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.config :as search.config]
   [metabase.search.scoring :as search.scoring]
   [metabase.util :as u]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2]))

;;
;; index-based scorers: these scorers only rely on columns in the search index in the pgvector db
;;

(defn- view-count-percentile-query
  [index-table p-value]
  (let [expr [:raw "percentile_cont(" [:lift p-value] ") WITHIN GROUP (ORDER BY view_count)"]]
    {:select   [:search_index.model [expr :vcp]]
     :from     [[(keyword index-table) :search_index]]
     :group-by [:search_index.model]
     :having   [:is-not expr nil]}))

(defn- view-count-percentiles*
  [index-table p-value]
  (into {} (for [{:keys [model vcp]}
                 ;; Get the db data-source directly rather than passing it in as an argument to this function to
                 ;; side-step potential issues with using the db as a cache key for the memoized version.
                 ;; https://github.com/metabase/metabase/pull/62086#discussion_r2272790618
                 (jdbc/execute! (semantic.db.datasource/ensure-initialized-data-source!)
                                (-> (view-count-percentile-query
                                     index-table
                                     p-value)
                                    (sql/format {:quoted true}))
                                {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
             [(keyword model) vcp])))

(def ^{:private true
       :arglists '([index-table p-value])}
  view-count-percentiles
  (if config/is-prod?
    (memoize/ttl view-count-percentiles*
                 :ttl/threshold (u/hours->ms 1))
    view-count-percentiles*))

(defn- view-count-expr [index-table percentile]
  (let [views (view-count-percentiles index-table percentile)
        cases (for [[sm v] views]
                [[:= :model [:inline (name sm)]] (max (or v 0) 1)])]
    (search.scoring/size :view_count (if (seq cases)
                                       (into [:case] cat cases)
                                       1))))

(defn- model-rank-exp [{:keys [context]}]
  (let [search-order search.config/models-search-order
        n (double (count search-order))
        cases (map-indexed (fn [i sm]
                             [[:= :model sm]
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
      [:coalesce [:/ 1.0 [:+ k :semantic_rank]] 0]]
     [:* [:cast keyword-weight :float]
      [:coalesce [:/ 1.0 [:+ k :keyword_rank]] 0]]]))

(defn base-scorers
  "The default constituents of the search ranking scores."
  [index-table {:keys [search-string limit-int] :as search-ctx}]
  (if (and limit-int (zero? limit-int))
    {:model [:inline 1]}
    ;; NOTE: we calculate scores even if the weight is zero, so that it's easy to consider how we could affect any
    ;; given set of results. At some point, we should optimize away the irrelevant scores for any given context.
    {:rrf       rrf-rank-exp
     :view-count (view-count-expr index-table search.config/view-count-scaling-percentile)
     :pinned     (search.scoring/truthy :pinned)
     :recency    (search.scoring/inverse-duration [:coalesce :last_viewed_at :model_updated_at]
                                                  [:now]
                                                  search.config/stale-time-in-days)
     :dashboard  (search.scoring/size :dashboardcard_count search.config/dashboard-count-ceiling)
     :model      (model-rank-exp search-ctx)
     :mine       (search.scoring/equal :creator_id (:current-user-id search-ctx))
     :exact      (if search-string
                   ;; perform the lower casing within the database, in case it behaves differently to our helper
                   (search.scoring/equal [:lower :name] [:lower search-string])
                   [:inline 0])
     :prefix     (if search-string
                   ;; in this case, we need to transform the string into a pattern in code, so forced to use helper
                   (search.scoring/prefix [:lower :name] (u/lower-case-en search-string))
                   [:inline 0])}))

(def ^:private enterprise-scorers
  {:official-collection {:expr (search.scoring/truthy :official_collection)
                         :pred #(premium-features/has-feature? :official-collections)}
   :verified            {:expr (search.scoring/truthy :verified)
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
  [index-table search-ctx]
  (merge (base-scorers index-table search-ctx)
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
  (def embedding-model ((requiring-resolve 'metabase-enterprise.semantic-search.embedding/get-configured-model)))
  (def index ((requiring-resolve 'metabase-enterprise.semantic-search.index/default-index) embedding-model))
  (def index-table (:table-name index)))

;;
;; appdb-based scorers: these scorers rely on tables in the appdb
;;

(defn- search-doc->values
  [idx {:keys [id model]}]
  ;; If you don't :inline these, then H2 can't deduce the types from the query params, so the idx and id are returned
  ;; as text and you get lexicographic ordering on the results idx.
  [[:inline idx] [:inline id] [:inline model]])

(defn- user-recency-query
  [{:keys [current-user-id]} search-results]
  {:with      [[[:search_docs {:columns [:idx :model_id :model]}]
                ;; TODO filter to docs with models in rv-models
                {:values (map-indexed search-doc->values search-results)}]]
   :select    [[:sd.idx :idx]
               [:sd.model_id :id]
               [:sd.model :model]
               [(search.scoring/inverse-duration [:max :rv.timestamp] [:now] search.config/stale-time-in-days)
                :user_recency]]
   :from      [[:search_docs :sd]]
   :left-join [[:recent_views :rv]
               [:and
                [:= :rv.user_id current-user-id]
                [:= :rv.model_id :sd.model_id]
                [:=
                 :rv.model
                 [:case
                  [:in :sd.model [[:inline "dataset"] [:inline "metric"]]]
                  [:inline "card"]
                  :else
                  :sd.model]]]]
   :group-by  [:sd.idx :sd.model_id :sd.model]
   :order-by  [[:sd.idx :asc]]})

(comment
  (execute-user-recency-query! {:current-user-id 3}
                               [{:id 123 :model "dataset"}
                                {:id 456 :model "dashboard"}
                                {:id 789 :model "metric"}])
  (-> (user-recency-query {:current-user-id 3}
                          [{:id 123 :model "dataset"}
                           {:id 456 :model "dashboard"}
                           {:id 789 :model "metric"}])
      sql/format))

(defn- execute-user-recency-query!
  [search-ctx search-results]
  (t2/query (user-recency-query search-ctx search-results)))

(defn- update-result-with-user-recency
  [weight search-result user-recency-result]
  ;; TODO remove
  (assert (= (:id search-result) (:id user-recency-result)))
  (assert (= (:model search-result) (:model user-recency-result)))
  (if-let [user-recency (:user_recency user-recency-result)]
    (let [contribution (* weight user-recency)]
      (-> search-result
          (update :score + contribution)
          (update :all-scores conj {:score user-recency
                                    :name :user-recency
                                    :weight weight
                                    :contribution contribution})))
    search-result))

(defn- update-results-with-user-recency
  [search-ctx search-results user-recency-results]
  (map (let [weight (search.config/weight (:context search-ctx) :user-recency)]
         (partial update-result-with-user-recency weight))
       search-results
       user-recency-results))

(defn with-appdb-scores
  "Add appdb-based scores to `search-results` and re-rank the results based on the new combined scores.

  This will extract required info like model ids from `search-results`, make a separate appdb query to select
  additional scorers, combine those with the existing `:score` and `:all-scores` in the `search-results`, then
  re-order the results by the new combined `:score`."
  [search-ctx search-results]
  (if-not (and (seq search-results)
               ;; The user-recency-query needs to be modified to work with mysql / mariadb
               (#{:postgres :h2} (mdb/db-type)))
    search-results
    (->> (execute-user-recency-query! search-ctx search-results)
         (update-results-with-user-recency search-ctx search-results)
         (sort-by :score >)
         vec)))
