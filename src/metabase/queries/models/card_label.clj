(ns metabase.queries.models.card-label
  "A legacy label of a Card, which no code writes any more."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/CardLabel [_model] :card_label)

(doto :model/CardLabel
  (derive :metabase/model)
  (derive :hook/worktree-id))

(defmethod app-db-copy/spec :model/CardLabel [_model]
  {:skip? true})
