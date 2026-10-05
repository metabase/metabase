(ns metabase-enterprise.semantic-search.sqlite-config
  "Hackathon: the switch for the SQLite semantic search store (`metabase-enterprise.semantic-search.sqlite`).
  Kept free of dependencies so the pgvector gates in `semantic-search.util` can consult it without a namespace
  cycle."
  (:require
   [clojure.string :as str]
   [environ.core :refer [env]]))

(defn db-path
  "The configured SQLite file path (`MB_SEMANTIC_SEARCH_SQLITE_PATH`), or nil when unset or blank."
  []
  (not-empty (str/trim (or (env :mb-semantic-search-sqlite-path) ""))))

(defn enabled?
  "Is semantic search backed by the SQLite store instead of pgvector? Cheap: reads the environment only."
  []
  (some? (db-path)))

(def ^:private default-max-distance
  ;; Correct paraphrase hits with ai-service snowflake-arctic-embed-l-v2.0 landed at 0.55-0.84 cosine distance
  ;; (PLAN_001 acceptance). pgvector's 0.7 would drop some of them; tune per model.
  0.8)

(defn max-distance
  "Semantic search results farther than this cosine distance are dropped (`MB_SEMANTIC_SEARCH_SQLITE_MAX_DISTANCE`,
  default 0.8)."
  []
  (or (some-> (env :mb-semantic-search-sqlite-max-distance) str/trim parse-double)
      default-max-distance))
