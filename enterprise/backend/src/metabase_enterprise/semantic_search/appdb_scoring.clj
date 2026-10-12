(ns metabase-enterprise.semantic-search.appdb-scoring
  "The app-DB based scorers of semantic search results. Expression building only:
  `metabase-enterprise.semantic-search.db` runs the query, so this namespace must not require it."
  (:require
   [metabase.search.config :as search.config]
   [metabase.search.scoring :as search.scoring]))

(defn appdb-scorers
  "The appdb-based scorers for search ranking results. Like `base-scorers`, but for scorers that need to query the appdb."
  [search-ctx]
  (when-not (search.scoring/no-scoring-required? search-ctx)
    {:bookmarked search.scoring/bookmark-score-expr
     :user-recency (search.scoring/inverse-duration
                    (search.scoring/user-recency-expr search-ctx) [:now] search.config/stale-time-in-days)}))
