(ns metabase-enterprise.advanced-permissions.models.permissions.general-permissions
  (:require [metabase.models.permissions :as perms :refer [Permissions]]
            [metabase.models.general-permissions-revision :as g-perm-revision :refer [GeneralPermissionsRevision]]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def ^:private GeneralPermissions (s/enum :yes :no))

(def ^:private GroupPermissionsGraph
  {:setting      GeneralPermissions
   :monitoring   GeneralPermissions
   :subscription GeneralPermissions})

(def ^:private GeneralPermissionsGraph
  {:revision s/Int
   :groups   {su/IntGreaterThanZero GroupPermissionsGraph}})

;; -------------------------------------------------- Fetch Graph ---------------------------------------------------

(defn- group-id->permissions-set []
  (into {} (for [[group-id perms]
                 (group-by :group-id (db/select [Permissions [:group_id :group-id] [:object :path]]
                                                {:where [:and
                                                         [:or
                                                          [:= :object "/subscription/"]
                                                          [:like :object (hx/literal "/general/%")]]]}))]
             {group-id (set (map :path perms))})))

(defn- permissions-type-for-general
  [permissions-set perm-type]
  (if (perms/set-has-full-permissions? permissions-set (perms/general-perms-path perm-type))
    :yes
    :no))

(s/defn permissions-set->general-perms :- GroupPermissionsGraph
  [permission-set]
  {:setting      (permissions-type-for-general permission-set :setting)
   :monitoring   (permissions-type-for-general permission-set :monitoring)
   :subscription (permissions-type-for-general permission-set :subscription)})

(s/defn graph :- GeneralPermissionsGraph
  "Fetch a graph representing the general permissions status for every group. This works just like the function of
  the same name in `metabase.models.permissions`; see also the documentation for that function."
  []
  (let [groups-id->general-perms (into {} )]
    {:revision (g-perm-revision/latest-id)
     :groups   (into {} (for [[group-id perms] (group-id->permissions-set)]
                          {group-id (permissions-set->general-perms perms)}))}))

;;; -------------------------------------------------- Update Graph --------------------------------------------------
