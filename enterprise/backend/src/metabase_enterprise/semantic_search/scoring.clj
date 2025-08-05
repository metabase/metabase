(ns metabase-enterprise.semantic-search.scoring
  (:require
   [clojure.walk :as walk]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.scoring :as search.scoring]))

(def ^:private index-table-columns
  ;; TODO move metabase-enterprise.semantic-search.index/index-table-schema into new namespace to break dep cycle and
  ;; compute this set from the index-table-schema.
  #{:id
    :model
    :model_id
    :database_id
    :collection_id
    :creator_id
    :last_editor_id
    :archived
    :verified
    :official_collection
    :pinned
    :dashboardcard_count
    :view_count
    :display_type
    :created_at
    :last_viewed_at
    :model_created_at
    :model_updated_at
    :legacy_input
    :metadata
    :content
    :text_search_vector
    :text_search_with_native_query_vector
    :embedding})

(def ^:private index-col->hybrid-expr
  "Map from an index table column name to an expression that can be used to reference that column in the outer hybrid search query.

  E.g. {:model [:coalesce :v.model :t.model] ...}"
  (let [prefixed #(keyword (str %1 (name %2)))]
    (into {}
          (mapcat (fn [col-name]
                    (let [hybrid-expr [:coalesce (prefixed "v." col-name) (prefixed "t." col-name)]]
                      [[col-name hybrid-expr]
                       [(prefixed "search_index." col-name) hybrid-expr]])))
          index-table-columns)))

(defn- replace-columns-with-hybrid-exprs
  [scorer-expr]
  (walk/postwalk-replace index-col->hybrid-expr scorer-expr))

(defn scorers
  "Return the select-item expressions used to calculate the score for semantic search results."
  [search-ctx]
  (-> (search.scoring/scorers search-ctx)
      (update-vals replace-columns-with-hybrid-exprs)))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [search-ctx scorers qry]
  (let [rrf-weight 100
        score-weight 1]
    (-> (search.scoring/with-scores search-ctx scorers qry)
        (sql.helpers/select [[:+
                              [:* rrf-weight :rrf_rank]
                              [:* score-weight :total_score]]
                             :rrf_total_score])
        (sql.helpers/order-by [:rrf_total_score :desc]))))
