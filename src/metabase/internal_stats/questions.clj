(ns metabase.internal-stats.questions
  (:require
   [metabase.internal-stats.db :as internal-stats.db]))

(defn question-statistics-all-time
  "Get metrics based on questions "
  []
  (internal-stats.db/question-statistics-all-time))
