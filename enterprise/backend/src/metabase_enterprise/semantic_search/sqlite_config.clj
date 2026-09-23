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
