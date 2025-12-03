(ns metabase-enterprise.semantic-search.scoring
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase.activity-feed.core :as activity-feed]
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
  [index-table {:keys [search-string] :as search-ctx}]
  (if (search.scoring/no-scoring-required? search-ctx)
    {:model [:inline 1]}
    ;; NOTE: we calculate scores even if the weight is zero, so that it's easy to consider how we could affect any
    ;; given set of results. At some point, we should optimize away the irrelevant scores for any given context.
    {:rrf        rrf-rank-exp
     :view-count (view-count-expr index-table search.config/view-count-scaling-percentile)
     :pinned     (search.scoring/truthy :pinned)
     :recency    (search.scoring/inverse-duration
                  :postgres
                  [:coalesce :last_viewed_at :model_updated_at]
                  [:now]
                  search.config/stale-time-in-days)
     :dashboard  (search.scoring/size :dashboardcard_count search.config/dashboard-count-ceiling)
     :model      (search.scoring/model-rank-expr search-ctx)
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

(defn- search-doc->select
  [{:keys [id model]}]
  {:select [[[:inline (str id)]] [[:inline model]]]})

(defn- search-index-query
  [search-results]
  {:with     [[[:search_index {:columns [:model_id :model]}]
               ;; We could use :values here, except MySQL uses a slightly different syntax and I can't seem to get
               ;; honeysql to generate a valid WITH ... VALUES statement for MySQL, so fallback to UNION + SELECT
               ;; which works with all supported appdbs. https://dev.mysql.com/doc/refman/8.4/en/values.html
               {:union (map search-doc->select search-results)}]]
   :select   [[[:cast :search_index.model_id (if (= :mysql (mdb/db-type))
                                               :unsigned
                                               :int)]
               :id]
              [:search_index.model :model]]
   :from     [:search_index]})

(defn- update-with-appdb-score
  [weights scorers grouped-appdb-results search-result]
  (let [id-model-key ((juxt :id :model) search-result)
        appdb-row (get grouped-appdb-results id-model-key)
        appdb-score (:total_score appdb-row 0)]
    (-> search-result
        (update :score + appdb-score)
        (update :all-scores concat (all-scores weights scorers appdb-row)))))

(defn- update-with-appdb-scores
  [weights scorers search-results appdb-scorer-results]
  (if-not (seq appdb-scorer-results)
    search-results
    (map (let [grouped-recency-results (m/index-by (juxt :id :model) appdb-scorer-results)]
           (partial update-with-appdb-score weights scorers grouped-recency-results))
         search-results)))

(def ^:private recent-views-models
  (into #{} (map name activity-feed/rv-models)))

(def ^:private appdb-scorer-models
  (-> recent-views-models
      ;; Add "transform" here because it's not a recent-views model, but should still be scored
      (conj "transform")
      (into (map name) search.scoring/bookmarked-models-and-sub-models)))

(comment
  (require '[metabase.search.spec :as search.spec])
  ;; #{"segment" "database" "action" "indexed-entity"}
  (set/difference (set search.spec/search-models) appdb-scorer-models))

(defn appdb-scorers
  "The appdb-based scorers for search ranking results. Like `base-scorers`, but for scorers that need to query the appdb."
  [search-ctx]
  (when-not (search.scoring/no-scoring-required? search-ctx)
    {:bookmarked search.scoring/bookmark-score-expr
     :user-recency (search.scoring/inverse-duration
                    (search.scoring/user-recency-expr search-ctx) [:now] search.config/stale-time-in-days)}))

(defn with-appdb-scores
  "Add appdb-based scores to `search-results` and re-sort the results based on the new combined scores.

  Supported appdb based scorers: `:user-recency` (postgres and H2)

  This will extract required info from `search-results`, make an appdb query to select additional scorers, combine
  those with the existing `:score` and `:all-scores` in the `search-results`, then re-sort the results by the new
  combined `:score`."
  [search-ctx appdb-scorers weights search-results]
  ;; search-results-to-score are the search-results that have models that are relevant to the appdb-scorers.
  (let [{:keys [current-user-id]} search-ctx
        search-results-to-score (filter (comp appdb-scorer-models :model) search-results)
        maybe-join-bookmarks #(cond-> % (:bookmarked appdb-scorers) (search.scoring/join-bookmarks current-user-id))]
    (if-not (and (seq search-results-to-score)
                 (seq appdb-scorers))
      search-results
      (->> (search-index-query search-results-to-score)
           (search.scoring/with-scores search-ctx appdb-scorers)
           maybe-join-bookmarks
           t2/query
           (update-with-appdb-scores weights (keys appdb-scorers) search-results)
           (sort-by :score >)
           vec))))

(comment
  (def search-ctx {:current-user-id 3
                   :context :default})
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
  (def weights (search.config/weights search-ctx))
  (def app-db-scorers (appdb-scorers search-ctx))
  (with-appdb-scores search-ctx (appdb-scorers search-ctx) weights search-docs))
