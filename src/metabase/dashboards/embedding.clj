(ns metabase.dashboards.embedding
  "What a Dashboard's embedding columns are and when a change touches them."
  (:require
   [metabase.api.common :as api]))

(def embedding-columns
  "The columns that decide whether and how a Dashboard is embedded."
  [:enable_embedding :embedding_type :embedding_params])

(defn changes-embedding?
  "Whether `changes` change the embedding of `dashboard`."
  [dashboard changes]
  (boolean (some #(api/column-will-change? (get dashboard %) (get changes % ::api/not-provided)) embedding-columns)))
