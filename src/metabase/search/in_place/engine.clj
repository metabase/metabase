(ns metabase.search.in-place.engine
  "The in-place (index-free) search engine: runs the queries built by `metabase.search.in-place.legacy`."
  (:require
   [metabase.search.db :as search.db]
   [metabase.search.engine :as search.engine]
   [metabase.search.in-place.legacy]))

(comment metabase.search.in-place.legacy/keep-me)

(defmethod search.engine/model-set :search.engine/in-place
  [search-ctx]
  (into #{} (map :model) (search.db/in-place-model-set-rows search-ctx)))

(defmethod search.engine/results :search.engine/in-place
  [search-ctx]
  (search.db/in-place-search-reducible search-ctx))
