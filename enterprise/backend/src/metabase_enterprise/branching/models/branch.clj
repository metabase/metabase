(ns metabase-enterprise.branching.models.branch
  (:require
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Branch
  [_model] :branch)

(doto :model/Branch
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/define-before-insert :model/Branch
  [branch]
  (assoc branch :slug (u/slugify (:name branch))))
