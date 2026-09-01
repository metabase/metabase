(ns metabase.timeline.models.timeline-queries
  "Query executors for `:model/Timeline`, built on [[metabase.app-db.hugsql]]. SQL lives in
  timeline.sql; executors return model instances so `t2/hydrate` composes downstream."
  (:require
   [hugsql.core :as hugsql]
   [metabase.app-db.hugsql :as app-db.hugsql]))

(set! *warn-on-reflection* true)

(def ^:private model :model/Timeline)

(declare timelines-for-collection-sqlvec)

(hugsql/def-sqlvec-fns "metabase/timeline/models/timeline.sql")

(defn timelines-for-collection
  "Timelines in `collection-id` (nil = root), filtered by `archived?`. Returns model instances."
  [collection-id archived?]
  ((app-db.hugsql/select-executor model timelines-for-collection-sqlvec)
   {:root?         (if (nil? collection-id) 1 0)
    :collection-id collection-id
    :archived      (boolean archived?)}))
