(ns metabase.models.collection.graph
  (:require [clojure.data :as data]
            [metabase.api.common :as api :refer [*current-user-id*]]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [collection-revision :as collection-revision :refer [CollectionRevision]]
             [permissions :as perms :refer [Permissions]]]
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
  (into {} (for [[group-id perms] (group-by :group_id (db/select 'Permissions))]
             {group-id (set (map :object perms))})))

(s/defn ^:private perms-type-for-collection :- CollectionPermissions
  [permissions-set collection-or-id]
  (cond
    (perms/set-has-full-permissions? permissions-set (perms/collection-readwrite-path collection-or-id)) :write
    (perms/set-has-full-permissions? permissions-set (perms/collection-read-path collection-or-id))      :read
    :else                                                                                                :none))

(s/defn ^:private group-permissions-graph :- GroupPermissionsGraph
  "Return the permissions graph for a single group having `permissions-set`."
  [permissions-set collection-ids]
  (into
   {:root (perms-type-for-collection permissions-set collection/root-collection)}
   (for [collection-id collection-ids]
     {collection-id (perms-type-for-collection permissions-set collection-id)})))

(s/defn ^:private non-personal-collection-ids :- #{su/IntGreaterThanZero}
  "Return a set of IDs of all Collections that are neither Personal Collections nor descendants of Personal
  Collections (i.e., things that you can set Permissions for, and that should go in the graph.)"
  []
  (->> (db/query
        (merge
         {:select [[:id :id]]
          :from   [Collection]}
         (when-let [personal-collection-ids (seq (db/select-ids Collection :personal_owner_id [:not= nil]))]
           {:where (apply
                    vector
                    :and
                    [:not-in :id personal-collection-ids]
                    (for [id personal-collection-ids]
                      [:not [:like :location (format "/%d/%%" id)]]))})))
       (map :id)
       set))

(s/defn graph :- PermissionsGraph
  "Fetch a graph representing the current permissions status for every group and all permissioned collections. This
  works just like the function of the same name in `metabase.models.permissions`; see also the documentation for that
  function."
  []
  (let [group-id->perms (group-id->permissions-set)
        collection-ids  (non-personal-collection-ids)]
    {:revision (collection-revision/latest-id)
     :groups   (into {} (for [group-id (db/select-ids 'PermissionsGroup)]
                          {group-id (group-permissions-graph (group-id->perms group-id) collection-ids)}))}))


;;; -------------------------------------------------- Update Graph --------------------------------------------------

(s/defn ^:private update-collection-permissions!
  [group-id             :- su/IntGreaterThanZero
   collection-id        :- (s/cond-pre (s/eq :root) su/IntGreaterThanZero)
   new-collection-perms :- CollectionPermissions]
  (let [collection-id (if (= collection-id :root)
                        collection/root-collection
                        collection-id)]
    ;; remove whatever entry is already there (if any) and add a new entry if applicable
    (perms/revoke-collection-permissions! group-id collection-id)
    (case new-collection-perms
      :write (perms/grant-collection-readwrite-permissions! group-id collection-id)
      :read  (perms/grant-collection-read-permissions! group-id collection-id)
      :none  nil)))

(s/defn ^:private update-group-permissions!
  [group-id :- su/IntGreaterThanZero, new-group-perms :- GroupPermissionsGraph]
  (doseq [[collection-id new-perms] new-group-perms]
    (update-collection-permissions! group-id collection-id new-perms)))

(defn- save-perms-revision!
  "Save changes made to the collection permissions graph for logging/auditing purposes.
   This doesn't do anything if `*current-user-id*` is unset (e.g. for testing or REPL usage)."
  [current-revision old new]
  (when *current-user-id*
    ;; manually specify ID here so if one was somehow inserted in the meantime in the fraction of a second since we
    ;; called `check-revision-numbers` the PK constraint will fail and the transaction will abort
    (db/insert! CollectionRevision
      :id     (inc current-revision)
      :before  old
      :after   new
      :user_id *current-user-id*)))

(s/defn update-graph!
  "Update the collections permissions graph. This works just like the function of the same name in
  `metabase.models.permissions`, but for `Collections`; refer to that function's extensive documentation to get a
  sense for how this works."
  ([new-graph :- PermissionsGraph]
   (let [old-graph (graph)
         [old new] (data/diff (:groups old-graph) (:groups new-graph))]
     (perms/log-permissions-changes old new)
     (perms/check-revision-numbers old-graph new-graph)
     (when (seq new)
       (db/transaction
         (doseq [[group-id changes] new]
           (update-group-permissions! group-id changes))
         (save-perms-revision! (:revision old-graph) old new)))))
  ;; The following arity is provided soley for convenience for tests/REPL usage
  ([ks new-value]
   {:pre [(sequential? ks)]}
   (update-graph! (assoc-in (graph) (cons :groups ks) new-value))))
