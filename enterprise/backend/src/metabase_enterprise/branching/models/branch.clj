(ns metabase-enterprise.branching.models.branch
  (:require
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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

 ;;; ------------------------------------------------- Helper Functions -------------------------------------------------

(mu/defn get-parent :- [:maybe (ms/InstanceOf :model/Branch)]
  "Get the parent branch of the given branch, if it exists."
  [branch :- (ms/InstanceOf :model/Branch)]
  (when-let [parent-id (:parent_branch_id branch)]
    (t2/select-one :model/Branch :id parent-id)))

(mu/defn get-children-by-id :- [:set (ms/InstanceOf :model/Branch)]
  "Get all branches with the specified parent_branch_id. If parent-id is nil,
   returns root-level branches (those with no parent)."
  [parent-id :- [:maybe ms/PositiveInt]]
  (set (t2/select :model/Branch :parent_branch_id parent-id)))

(mu/defn get-children :- [:set (ms/InstanceOf :model/Branch)]
  "Get all direct child branches of the given branch."
  [branch :- (ms/InstanceOf :model/Branch)]
  (get-children-by-id (:id branch)))

(mu/defn get-has-children? :- :boolean
  "Check if the given branch has any child branches."
  [branch :- (ms/InstanceOf :model/Branch)]
  (t2/exists? :model/Branch :parent_branch_id (:id branch)))

;;; ------------------------------------------------- Hydration Methods -------------------------------------------------

(mi/define-simple-hydration-method parent
  :parent
  "Hydrate a branch with its parent branch."
  [branch]
  (get-parent branch))

(mi/define-simple-hydration-method children
  :children
  "Hydrate a branch with its direct child branches."
  [branch]
  (get-children branch))

(mi/define-simple-hydration-method has-children?
  :has_children
  "Hydrate a branch with a boolean indicating whether it has child branches."
  [branch]
  (get-has-children? branch))
