(ns metabase-enterprise.advanced-permissions.models.permissions.application-permissions
  "Code for generating and updating the Application Permission graph. See [[metabase.models.permissions]] for more
  details and for the code for generating and updating the *data* permissions graph."
  (:require
   [clojure.data :as data]
   [metabase.models :refer [ApplicationPermissionsRevision Permissions]]
   [metabase.models.application-permissions-revision :as a-perm-revision]
   [metabase.models.permissions :as perms]
   [metabase.permissions.util :as perms.u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def ^:private GroupPermissionsGraph
  [:map-of
   [:enum :setting :monitoring :subscription]
   [:enum :yes :no]])

(def ^:private ApplicationPermissionsGraph
  [:map {:closed true}
   [:revision :int]
   [:groups [:map-of ms/PositiveInt GroupPermissionsGraph]]])

;; -------------------------------------------------- Fetch Graph ---------------------------------------------------

(defn- group-id->permissions-set
  "Returns a map of group-id -> application permissions paths.
  Only groups that has at least one application permission enabled will be included."
  []
  (let [application-permissions (t2/select Permissions
                                           {:where [:or
                                                    [:= :object "/"]
                                                    [:like :object (h2x/literal "/application/%")]]})]
    (into {} (for [[group-id perms] (group-by :group_id application-permissions)]
               {group-id (set (map :object perms))}))))

(defn- permission-for-type
  [permissions-set perm-type]
  (if (perms/set-has-full-permissions? permissions-set (perms/application-perms-path perm-type))
    :yes
    :no))

(mu/defn permissions-set->application-perms :- GroupPermissionsGraph
  "Get a map of all application permissions for a group."
  [permission-set]
  {:setting      (permission-for-type permission-set :setting)
   :monitoring   (permission-for-type permission-set :monitoring)
   :subscription (permission-for-type permission-set :subscription)})

(mu/defn graph :- ApplicationPermissionsGraph
  "Fetch a graph representing the application permissions status for groups that has at least one application permission enabled.
  This works just like the function of the same name in `metabase.models.permissions`;
  see also the documentation for that function."
  []
  {:revision (a-perm-revision/latest-id)
   :groups   (into {} (for [[group-id perms] (group-id->permissions-set)]
                        {group-id (permissions-set->application-perms perms)}))})

;;; -------------------------------------------------- Update Graph --------------------------------------------------

(defn update-application-permissions!
  "Perform update application permissions for a group-id."
  [group-id changes]
  (doseq [[perm-type perm-value] changes]
    (case perm-value
      :yes
      (perms/grant-application-permissions! group-id perm-type)

      :no
      (perms/revoke-application-permissions! group-id perm-type))))

(mu/defn update-graph!
  "Update the application Permissions graph.
  This works just like [[metabase.models.data-permissions.graph/update-data-perms-graph!]], but for Application permissions;
  refer to that function's extensive documentation to get a sense for how this works."
  [new-graph :- ApplicationPermissionsGraph]
  (let [old-graph          (graph)
        old-perms          (:groups old-graph)
        new-perms          (:groups new-graph)
        [diff-old changes] (data/diff old-perms new-perms)]
    (perms.u/log-permissions-changes diff-old changes)
    (perms.u/check-revision-numbers old-graph new-graph)
    (when (seq changes)
      (t2/with-transaction [_conn]
       (doseq [[group-id changes] changes]
         (update-application-permissions! group-id changes))
       (perms.u/save-perms-revision! ApplicationPermissionsRevision (:revision old-graph) (:groups old-graph) changes)))))
