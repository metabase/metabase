(ns metabase.models.collection.graph
  (:require [clojure.data :as data]
            [metabase.api.common :as api :refer [*current-user-id*]]
            [metabase.models.collection :as collection :refer [Collection]]
            [metabase.models.collection-permission-graph-revision :as c-perm-revision
             :refer [CollectionPermissionGraphRevision]]
            [metabase.models.permissions :as perms :refer [Permissions]]
            [metabase.models.permissions-group :refer [PermissionsGroup]]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               PERMISSIONS GRAPH                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def ^:private CollectionPermissions
  (s/enum :write :read :none))

(def ^:private GroupPermissionsGraph
  "collection-id -> status"
  {(s/optional-key :root) CollectionPermissions   ; when doing a delta between old graph and new graph root won't always
   su/IntGreaterThanZero  CollectionPermissions}) ; be present, which is why it's *optional*

(def ^:private PermissionsGraph
  {:revision s/Int
   :groups   {su/IntGreaterThanZero GroupPermissionsGraph}})


;;; -------------------------------------------------- Fetch Graph ---------------------------------------------------

(defn- group-id->permissions-set []
  (into {} (for [[group-id perms] (group-by :group_id (db/select Permissions))]
             {group-id (set (map :object perms))})))

(s/defn ^:private perms-type-for-collection :- CollectionPermissions
  [permissions-set collection-or-id]
  (cond
    (perms/set-has-full-permissions? permissions-set (perms/collection-readwrite-path collection-or-id)) :write
    (perms/set-has-full-permissions? permissions-set (perms/collection-read-path collection-or-id))      :read
    :else                                                                                                :none))

(s/defn ^:private group-permissions-graph :- GroupPermissionsGraph
  "Return the permissions graph for a single group having `permissions-set`."
  [collection-namespace permissions-set collection-ids]
  (into
   {:root (perms-type-for-collection permissions-set (assoc collection/root-collection :namespace collection-namespace))}
   (for [collection-id collection-ids]
     {collection-id (perms-type-for-collection permissions-set collection-id)})))

(s/defn ^:private non-personal-collection-ids :- #{su/IntGreaterThanZero}
  "Return a set of IDs of all Collections that are neither Personal Collections nor descendants of Personal
  Collections (i.e., things that you can set Permissions for, and that should go in the graph.)"
  [collection-namespace :- (s/maybe su/KeywordOrString)]
  (let [personal-collection-ids (db/select-ids Collection :personal_owner_id [:not= nil])
        honeysql-form           {:select [[:id :id]]
                                 :from   [Collection]
                                 :where  (into [:and
                                                [:= :namespace (u/qualified-name collection-namespace)]
                                                [:= :personal_owner_id nil]]
                                               (for [collection-id personal-collection-ids]
                                                 [:not [:like :location (hx/literal (format "/%d/%%" collection-id))]]))}]
    (set (map :id (db/query honeysql-form)))))

(s/defn graph :- PermissionsGraph
  "Fetch a graph representing the current permissions status for every group and all permissioned collections. This
  works just like the function of the same name in `metabase.models.permissions`; see also the documentation for that
  function.

  The graph is restricted to a given namespace by the optional `collection-namespace` param; by default, `nil`, which
  restricts it to the 'default' namespace containing normal Card/Dashboard/Pulse Collections.

  Note: All Collections are returned at the same level of the 'graph', regardless of how the Collection hierarchy is
  structured. Collections do not inherit permissions from ancestor Collections in the same way data permissions are
  inherited (e.g. full `:read` perms for a Database implies `:read` perms for all its schemas); a 'child' object (e.g.
  schema) *cannot* have more restrictive permissions than its parent (e.g. Database). Child Collections *can* have
  more restrictive permissions than their parent."
  ([]
   (graph nil))

  ([collection-namespace :- (s/maybe su/KeywordOrString)]
   (let [group-id->perms (group-id->permissions-set)
         collection-ids  (non-personal-collection-ids collection-namespace)]
     {:revision (c-perm-revision/latest-id)
      :groups   (into {} (for [group-id (db/select-ids PermissionsGroup)]
                           {group-id (group-permissions-graph collection-namespace (group-id->perms group-id) collection-ids)}))})))


;;; -------------------------------------------------- Update Graph --------------------------------------------------

(s/defn ^:private update-collection-permissions!
  [collection-namespace :- (s/maybe su/KeywordOrString)
   group-id             :- su/IntGreaterThanZero
   collection-id        :- (s/cond-pre (s/eq :root) su/IntGreaterThanZero)
   new-collection-perms :- CollectionPermissions]
  (let [collection-id (if (= collection-id :root)
                        (assoc collection/root-collection :namespace collection-namespace)
                        collection-id)]
    ;; remove whatever entry is already there (if any) and add a new entry if applicable
    (perms/revoke-collection-permissions! group-id collection-id)
    (case new-collection-perms
      :write (perms/grant-collection-readwrite-permissions! group-id collection-id)
      :read  (perms/grant-collection-read-permissions! group-id collection-id)
      :none  nil)))

(s/defn ^:private update-group-permissions!
  [collection-namespace :- (s/maybe su/KeywordOrString)
   group-id             :- su/IntGreaterThanZero
   new-group-perms      :- GroupPermissionsGraph]
  (doseq [[collection-id new-perms] new-group-perms]
    (update-collection-permissions! collection-namespace group-id collection-id new-perms)))

(defn- save-perms-revision!
  "Save changes made to the collection permissions graph for logging/auditing purposes. This doesn't do anything if
  `*current-user-id*` is unset (e.g. for testing or REPL usage).

  *  `before-graph`-- the entire graph as it existed before the revision.
  *  `changes` -- set of changes applied in this revision."
  [collection-namespace current-revision before-graph changes]
  (when *current-user-id*
    ;; manually specify ID here so if one was somehow inserted in the meantime in the fraction of a second since we
    ;; called `check-revision-numbers` the PK constraint will fail and the transaction will abort
    (db/insert! CollectionPermissionGraphRevision
      :id     (inc current-revision)
      :before  (assoc before-graph :namespace collection-namespace)
      :after   changes
      :user_id *current-user-id*)))

(s/defn update-graph!
  "Update the Collections permissions graph for Collections of `collection-namespace` (default `nil`, the 'default'
  namespace). This works just like the function of the same name in `metabase.models.permissions`, but for
  Collections; refer to that function's extensive documentation to get a sense for how this works."
  ([new-graph]
   (update-graph! nil new-graph))

  ([collection-namespace :- (s/maybe su/KeywordOrString), new-graph :- PermissionsGraph]
   (let [old-graph          (graph collection-namespace)
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
           (update-group-permissions! collection-namespace group-id changes))
         (save-perms-revision! collection-namespace (:revision old-graph) old-graph changes))))))
