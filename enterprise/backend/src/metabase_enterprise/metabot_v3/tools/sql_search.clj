(ns metabase-enterprise.metabot-v3.tools.sql-search
  "Tool for searching SQL queries by content."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- extract-sql-content
  "Extract SQL content from a card's dataset_query."
  [card]
  (get-in card [:dataset_query :native :query]))

(defn- sql-contains-query?
  "Check if SQL content contains the search query (case-insensitive)."
  [sql query]
  (when sql
    (str/includes? (str/lower-case sql) (str/lower-case query))))

(defn- rank-result
  "Calculate a relevance rank for a search result.
  Higher rank = more relevant. Based on:
  - Name match (highest)
  - Description match (medium)
  - SQL content match position (lower = better)
  - Recently updated (bonus)"
  [card query]
  (let [query-lower (str/lower-case query)
        sql (extract-sql-content card)
        sql-lower (when sql (str/lower-case sql))
        name-lower (str/lower-case (or (:name card) ""))
        desc-lower (str/lower-case (or (:description card) ""))

        ;; Calculate position bonus (earlier in SQL = better)
        sql-pos (when sql-lower
                  (or (str/index-of sql-lower query-lower) Integer/MAX_VALUE))
        position-score (if (< sql-pos 1000)
                         (- 1000 sql-pos)
                         0)

        ;; Name match is most important
        name-score (if (str/includes? name-lower query-lower) 10000 0)

        ;; Description match is second
        desc-score (if (str/includes? desc-lower query-lower) 5000 0)

        ;; Recent update bonus (last 30 days)
        updated-at (:updated_at card)
        days-old (when updated-at
                   (/ (- (System/currentTimeMillis) (.getTime updated-at))
                      86400000)) ; ms per day
        recency-score (if (and days-old (< days-old 30))
                        (- 100 (* days-old 3))
                        0)]

    (+ name-score desc-score position-score recency-score)))

(defn- format-search-result
  "Format a card for the search results."
  [card]
  {:id          (:id card)
   :type        "question"
   :name        (:name card)
   :description (:description card)
   :database_id (:database_id card)
   :updated_at  (:updated_at card)
   :created_at  (:created_at card)
   :query_snippet (let [sql (extract-sql-content card)]
                   ;; Return first 200 chars of SQL as preview
                    (when sql
                      (if (> (count sql) 200)
                        (str (subs sql 0 200) "...")
                        sql)))})

(defn sql-search
  "Search for SQL queries by content.

  Parameters:
  - query: Search string to look for in SQL queries
  - database-id: Optionally filter by database ID
  - limit: Maximum number of results (default 20, max 50)

  Returns a map with:
  - :data - List of matching queries with metadata
  - :total_count - Number of results returned"
  [{:keys [query database-id limit]}]
  (log/info "Searching SQL queries"
            {:query query
             :database-id database-id
             :limit limit})

  (let [limit (min (or limit 20) 50)
        ;; Fetch all native queries the user can access
        all-cards (t2/select :model/Card
                             {:where [:and
                                      [:= :archived false]
                                      [:= :query_type "native"]
                                      (when database-id
                                        [:= :database_id database-id])]
                              :order-by [[:updated_at :desc]]
                              :limit 500}) ; Reasonable upper bound for search

        ;; Filter by permissions and SQL content
        accessible-cards (filter #(and (perms/can-read? %)
                                       (sql-contains-query? (extract-sql-content %) query))
                                 accessible-cards)

        ;; Rank results by relevance
        ranked-results (->> accessible-cards
                            (map (fn [card]
                                   {:card card
                                    :rank (rank-result card query)}))
                            (sort-by :rank >)
                            (take limit)
                            (map :card))

        ;; Format results
        formatted-results (map format-search-result ranked-results)]

    (log/info "SQL search complete"
              {:results-count (count formatted-results)
               :total-scanned (count accessible-cards)})

    {:data        formatted-results
     :total_count (count formatted-results)}))

(defn sql-search-tool
  "Tool handler for sql_search tool.
  Returns structured output with search results."
  [args]
  (try
    (let [result (sql-search args)]
      {:structured-output result})
    (catch Exception e
      (log/error e "Error searching SQL queries")
      {:output (str "SQL search failed: " (or (ex-message e) "Unknown error"))})))
