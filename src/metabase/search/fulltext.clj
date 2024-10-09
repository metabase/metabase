(ns metabase.search.fulltext
  (:require
   [metabase.public-settings :as public-settings]
   [metabase.search.api :as search.api]
   [metabase.search.postgres.core :as search.postgres]))

;; We have a bunch of experimental flavors! 🧄🌶🍊
(derive :search.engine/hybrid :search.engine/fulltext)
(derive :search.engine/hybrid-multi :search.engine/fulltext)
(derive :search.engine/minimal :search.engine/fulltext)
(derive :search.engine/minimal-with-perms :search.engine/fulltext)

(defmulti supported-db? "Does the app db support fulltext search?" identity)

(defmethod supported-db? :default [_] false)

(defmethod supported-db? :postgres [_]
  (public-settings/experimental-fulltext-search-enabled))

;; For now we now that the app db is postgres. We can make these multimethods when that changes.

(defmethod search.api/results :search.engine/fulltext
  [search-ctx]
  (search.postgres/search search-ctx))

(defmethod search.api/model-set :search.engine/fulltext
  [search-ctx]
  (search.postgres/model-set search-ctx))

(defmethod search.api/score :search.engine/fulltext
  [results search-ctx]
  (search.postgres/no-scoring results search-ctx))
