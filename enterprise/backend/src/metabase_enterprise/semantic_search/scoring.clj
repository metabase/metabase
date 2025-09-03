(ns metabase-enterprise.semantic-search.scoring
  (:require
   [clojure.core.memoize :as memoize]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase.activity-feed.models.recent-views :as recent-views]
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
  [{:keys [id model]}]
  ;; :inline otherwise H2 can't deduce the types from the query params and the id is returned as text.
  [[:inline id] [:inline model]])

(defn- user-recency-query
  [{:keys [current-user-id]} search-results]
  {:with     [[[:search_docs {:columns [:model_id :model]}]
               {:values (map search-doc->values search-results)}]]
   :select   [[:sd.model_id :id]
              [:sd.model :model]
              [(search.scoring/inverse-duration [:max :rv.timestamp] [:now] search.config/stale-time-in-days)
               :user_recency]]
   :from     [[:search_docs :sd]]
   :join     [[:recent_views :rv]
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
   :group-by [:sd.model_id :sd.model]})

(defn- execute-user-recency-query!
  [search-ctx search-results]
  (t2/query (user-recency-query search-ctx search-results)))

(defn- update-result-with-user-recency
  [weight grouped-recency-results search-result]
  (let [id-model-key ((juxt :id :model) search-result)
        user-recency-row (get grouped-recency-results id-model-key)
        user-recency (:user_recency user-recency-row 0)
        contribution (* weight user-recency)]
    (-> search-result
        (update :score + contribution)
        (update :all-scores conj {:score user-recency
                                  :name :user-recency
                                  :weight weight
                                  :contribution contribution}))))

(defn- update-results-with-user-recency
  [search-ctx search-results user-recency-results]
  (if-not (seq user-recency-results)
    search-results
    (map (let [weight (search.config/weight (:context search-ctx) :user-recency)
               grouped-recency-results (m/index-by (juxt :id :model) user-recency-results)]
           (partial update-result-with-user-recency weight grouped-recency-results))
         search-results)))

(def ^:private recent-views-models
  (into #{} (map name recent-views/rv-models)))

(comment
  (require '[clojure.set :as set]
           '[metabase.search.spec :as search.spec])
  ;; #{"segment" "database" "action" "indexed-entity"}
  (set/difference search.spec/search-models recent-views-models))

(defn with-appdb-scores
  "Add appdb-based scores to `search-results` and re-sort the results based on the new combined scores.

  Supported appdb based scorers: `:user-recency` (postgres and H2)

  This will extract required info from `search-results`, make an appdb query to select additional scorers, combine
  those with the existing `:score` and `:all-scores` in the `search-results`, then re-sort the results by the new
  combined `:score`."
  [search-ctx search-results]
  ;; filtered-search-results are the search-results that have models that are tracked in the recent_views table,
  ;; i.e. results that might possibly have user-recency info.
  (let [filtered-search-results (filter (comp recent-views-models :model) search-results)]
    (if-not (and (seq filtered-search-results)
                 ;; The user-recency-query needs to be modified to work with mysql / mariadb (BOT-360)
                 (#{:postgres :h2} (mdb/db-type)))
      search-results
      (->> (execute-user-recency-query! search-ctx filtered-search-results)
           (update-results-with-user-recency search-ctx search-results)
           (sort-by :score >)
           vec))))

(comment
  (def search-ctx {:current-user-id 3})
  (def search-docs (-> (map-indexed
                        (fn [idx doc]
                          (assoc doc :score idx :all-scores []))
                        [{:id 1 :model "dataset"}
                         {:id 1 :model "dashboard"}
                         {:id 2 :model "table"}
                         {:id 2 :model "card"}
                         {:id 4 :model "indexed-entity"}
                         {:id 7 :model "card"}])
                       vec))
  (with-appdb-scores search-ctx search-docs)
  (->> (execute-user-recency-query! search-ctx search-docs)
       (update-results-with-user-recency search-ctx search-docs)))
