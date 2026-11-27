(ns metabase.queries.models.report-cardfavorite
  "A legacy favorite of a Card, which no code writes any more."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/CardFavorite [_model] :report_cardfavorite)

(doto :model/CardFavorite
  (derive :metabase/model)
  (derive :hook/worktree-id))

(defmethod app-db-copy/spec :model/CardFavorite [_model]
  {:skip? true})
