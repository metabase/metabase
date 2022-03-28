(ns metabase-enterprise.advanced-permissions.models.permissions.general-permissions
  "Code for generating and updating the General Permission graph. See [[metabase.models.permissions]] for more
  details and for the code for generating and updating the *data* permissions graph."
  (:require [clojure.data :as data]
            [metabase.models :refer [GeneralPermissionsRevision Permissions]]
            [metabase.models.general-permissions-revision :as g-perm-revision]
            [metabase.models.permissions :as perms]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def ^:private GroupPermissionsGraph
  {(s/enum :setting :monitoring :subscription) (s/enum :yes :no)})

(def ^:private GeneralPermissionsGraph
  {:revision s/Int
   :groups   {su/IntGreaterThanZero GroupPermissionsGraph}})

;; -------------------------------------------------- Fetch Graph ---------------------------------------------------

(defn- group-id->permissions-set
  "Returns a map of group-id -> general permissions paths.
  Only groups that has at least one general permission enabled will be included."
  []
  (let [general-permissions (db/select Permissions
                                       {:where [:or
                                                [:= :object "/"]
                                                [:like :object (hx/literal "/general/%")]]})]
    (into {} (for [[group-id perms] (group-by :group_id general-permissions)]
               {group-id (set (map :object perms))}))))

(defn- permission-for-type
  [permissions-set perm-type]
  (if (perms/set-has-full-permissions? permissions-set (perms/general-perms-path perm-type))
    :yes
    :no))

(s/defn permissions-set->general-perms :- GroupPermissionsGraph
  "Get a map of all general permissions for a group."
  [permission-set]
  {:setting      (permission-for-type permission-set :setting)
   :monitoring   (permission-for-type permission-set :monitoring)
   :subscription (permission-for-type permission-set :subscription)})

(s/defn graph :- GeneralPermissionsGraph
  "Fetch a graph representing the general permissions status for groups that has at least one general permission enabled.
  This works just like the function of the same name in `metabase.models.permissions`;
  see also the documentation for that function."
  []
  {:revision (g-perm-revision/latest-id)
   :groups   (into {} (for [[group-id perms] (group-id->permissions-set)]
                        {group-id (permissions-set->general-perms perms)}))})

;;; -------------------------------------------------- Update Graph --------------------------------------------------

(defn update-general-permissions!
  "Perform update general permissions for a group-id."
  [group-id changes]
  (doseq [[perm-type perm-value] changes]
    (case perm-value
      :yes
      (perms/grant-general-permissions! group-id perm-type)

      :no
      (perms/revoke-general-permissions! group-id perm-type))))

(s/defn update-graph!
  "Update the General Permissions graph.
  This works just like [[metabase.models.permission/update-data-perms-graph!]], but for General permissions;
  refer to that function's extensive documentation to get a sense for how this works."
  [new-graph :- GeneralPermissionsGraph]
  (let [old-graph          (graph)
        old-perms          (:groups old-graph)
        new-perms          (:groups new-graph)
        [diff-old changes] (data/diff old-perms new-perms)]
    (perms/log-permissions-changes diff-old changes)
    (perms/check-revision-numbers old-graph new-graph)
    (when (seq changes)
      (db/transaction
       (doseq [[group-id changes] changes]
         (update-general-permissions! group-id changes))
       (perms/save-perms-revision! GeneralPermissionsRevision (:revision old-graph) (:groups old-graph) changes)))))
