(ns metabase-enterprise.advanced-permissions.models.permissions.general-permissions
  "Code for generating and updating the General Permission graph. See [[metabase.models.permissions]] for more
  details and for the code for generating and updating the *data* permissions graph."
  (:require [clojure.data :as data]
            [metabase.models :refer [Permissions PermissionsGroup GeneralPermissionsRevision]]
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
  "Get a map of general permissions for all existing group-ids"
  []
  (let [group-ids           (db/select-field :id PermissionsGroup)
        general-permissions (db/select Permissions
                                       {:where [:or
                                                [:= :object "/"]
                                                [:like :object (hx/literal "/general/%")]]})
        permissions-set-from-group-id (fn [group-id]
                                        (->> general-permissions
                                             (filter #(= (:group_id %) group-id))
                                             (map :object)
                                             set))]
    (into {} (for [group-id group-ids]
               {group-id (permissions-set-from-group-id group-id)}))))

(s/defn general-perms-path :- perms/Path
  "Get general permission's path by permissions's type"
  [perm-type]
  (case perm-type
    :setting
    "/general/setting/"

    :monitoring
    "/general/monitoring/"

    :subscription
    "/general/subscription/"))

(defn- permission-for-type
  [permissions-set perm-type]
  (if (perms/set-has-full-permissions? permissions-set (general-perms-path perm-type))
    :yes
    :no))

(s/defn permissions-set->general-perms :- GroupPermissionsGraph
  "Get a map of all general permissions for a group"
  [permission-set]
  {:setting      (permission-for-type permission-set :setting)
   :monitoring   (permission-for-type permission-set :monitoring)
   :subscription (permission-for-type permission-set :subscription)})

(s/defn graph :- GeneralPermissionsGraph
  "Fetch a graph representing the general permissions status for every group. This works just like the function of
  the same name in `metabase.models.permissions`; see also the documentation for that function."
  []
  {:revision (g-perm-revision/latest-id)
   :groups   (into {} (for [[group-id perms] (group-id->permissions-set)]
                        {group-id (permissions-set->general-perms perms)}))})

;;; -------------------------------------------------- Update Graph --------------------------------------------------

(defn update-general-permissions!
  "Perform update general permissions for a group-id"
  [group-id changes]
  (doseq [[permission-type permission-value] changes]
    (case permission-value
      :yes
      (perms/grant-permissions! group-id (general-perms-path permission-type))

      :no
      (perms/delete-related-permissions! group-id (general-perms-path permission-type)))))

(s/defn update-graph!
  "Update the General Permissions graph.
  This works just like [[metabase.models.permission/update-data-perms-graph!]], but for General permissions;
  refer to that function's extensive documentation to get a sense for how this works."
  [new-graph :- GeneralPermissionsGraph]
  (let [old-graph          (graph)
        old-perms          (:groups old-graph)
        new-perms          (:groups new-graph)
        ;; filter out any groups not in the old graph
        new-perms          (select-keys new-perms (keys old-perms))
        ;; filter out any permission type that are not in the old graph
        new-perms          (into {} (for [[group-id permissions] new-perms]
                                      [group-id (select-keys permissions (keys (get old-perms group-id)))]))
        [diff-old changes] (data/diff old-perms new-perms)]
    (perms/log-permissions-changes diff-old changes)
    (perms/check-revision-numbers old-graph new-graph)
    (when (seq changes)
      (db/transaction
       (doseq [[group-id changes] changes]
         (update-general-permissions! group-id changes))
       (perms/save-perms-revision! GeneralPermissionsRevision (:revision old-graph) old-graph changes)))))
