(ns metabase-enterprise.advanced-permissions.models.permissions.general-permissions
  (:require [clojure.data :as data]
            [metabase.api.common :as api :refer [*current-user-id*]]
            [metabase.models.general-permissions-revision :as g-perm-revision :refer [GeneralPermissionsRevision]]
            [metabase.models.permissions :as perms :refer [Permissions]]
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

(s/defn general-perms-path :- perms/Path
  [perm-type]
  (case perm-type
    :setting
    "/general/setting/"

    :monitoring
    "/general/monitoring/"

    :subscription
    "/subscription/"))

(defn- permissions-type-for-general
  [permissions-set perm-type]
  (if (perms/set-has-full-permissions? permissions-set (general-perms-path perm-type))
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
  {:revision (g-perm-revision/latest-id)
   :groups   (into {} (for [[group-id perms] (group-id->permissions-set)]
                        {group-id (permissions-set->general-perms perms)}))})

;;; -------------------------------------------------- Update Graph --------------------------------------------------

(defn- save-perms-revision!
  "Save changes made to the permissions graph for logging/auditing purposes.
   This doesn't do anything if `*current-user-id*` is unset (e.g. for testing or REPL usage)."
  [current-revision old changes]
  (when *current-user-id*
    (db/insert! GeneralPermissionsRevision
      ;; manually specify ID here so if one was somehow inserted in the meantime in the fraction of a second since we
      ;; called `check-revision-numbers` the PK constraint will fail and the transaction will abort
      :id      (inc current-revision)
      :before  old
      :changes changes
      :user_id *current-user-id*)))

(defn update-general-permissions!
  [group-id changes]
  (doseq [[permission-type permission-value] changes]
    (case permission-value
      :yes
      (perms/grant-permissions! group-id (general-perms-path permission-type))

      :no
      (perms/delete-related-permissions! group-id (general-perms-path permission-type)))))

(s/defn update-graph!
  [new-graph :- GeneralPermissionsGraph]
  (let [old-graph          (graph)
        old-perms          (:groups old-graph)
        new-perms          (:groups new-graph)
        ;; filter out any groups not in the old graph
        new-perms          (select-keys new-perms (keys old-perms))
        ;; filter out any collections not in the old graph
        new-perms          (into {} (for [[group-id collection-id->perms] new-perms]
                                      [group-id (select-keys collection-id->perms (keys (get old-perms group-id)))]))
        [diff-old changes] (data/diff old-perms new-perms)]
    (perms/log-permissions-changes diff-old changes)
    (perms/check-revision-numbers old-graph new-graph)
    (when (seq changes)
      (db/transaction
       (doseq [[group-id changes] changes]
         (update-general-permissions! group-id changes))
       (save-perms-revision! (:revision old-graph) old-graph changes)))))
