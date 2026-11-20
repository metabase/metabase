(ns metabase.permissions.models.collection.graph
  "Code for generating the Collection permissions graph; [[metabase.permissions.write/update-graph!]] updates it."
  (:require
   [metabase.audit-app.core :as audit]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.models.collection-permission-graph-revision :as c-perm-revision]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               PERMISSIONS GRAPH                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; PostgreSQL limits prepared statements to 65,535 bind parameters.
(def ^:private max-in-clause-size 20000)

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def CollectionPermissions
  "The access a group has to a Collection in the graph."
  [:enum :write :read :none])

(def GroupPermissionsGraph
  "collection-id -> status"
  ; when doing a delta between old graph and new graph root won't always
  ; be present, which is why it's *optional*
  [:map-of [:or [:= :root] ms/PositiveInt] CollectionPermissions])

(def PermissionsGraph
  "The Collection permissions graph: a revision and, per group, the access to each Collection."
  [:map {:closed true}
   [:revision {:optional true} [:maybe :int]]
   [:groups   [:map-of ms/PositiveInt GroupPermissionsGraph]]])

;;; -------------------------------------------------- Fetch Graph ---------------------------------------------------
;;;

(defn- collection-permission-graph
  "Return the permission graph for the collections with id in `collection-ids` and the root collection."
  [group-perms]
  {:revision (c-perm-revision/latest-id)
   :groups group-perms})

(defn- modify-instance-analytics-for-admins
  "In the graph, override the instance analytics collection within the admin group to read."
  [graph]
  (let [admin-group-id (:id (perms-group/admin))
        audit-collection-id (:id (audit/default-audit-collection))]
    (if (nil? audit-collection-id)
      graph
      (assoc-in graph [:groups admin-group-id audit-collection-id] :read))))

(defn- reduce-graph-query
  "Run the graph query for a specific chunk of collection IDs and reduce results into `accum`."
  [accum collection-namespace include-root? root-object ids-without-root group-ids]
  (reduce (fn [acc {group-id :group_id collection-id :collection_id :keys [writable readable]}]
            (assoc-in acc [group-id (or collection-id :root)]
                      (cond
                        (= writable 1) :write
                        (= readable 1) :read
                        :else :none)))
          accum
          (permissions.db/collection-graph-rows
           collection-namespace include-root? root-object ids-without-root group-ids
           (u/the-id (perms-group/admin)))))

(mu/defn graph :- PermissionsGraph
  "Fetch a sparse graph representing the current permissions status for groups and collections with permissions.

  The returned graph is **sparse**: it only includes entries for groups and collections that have explicit
  permissions (`:read` or `:write`). Groups without any permissions and collections without permissions for a
  given group are omitted from the graph.

  **Exclusions:**
  - Personal collections and their descendants are never included
  - Archived collections are excluded
  - Trash collections are excluded
  - Collections from other namespaces are excluded when `collection-namespace` is specified

  **Parameters:**
  - `collection-namespace` (optional): Restricts the graph to a specific namespace. Default `nil` returns
    collections in the 'default' namespace (normal Card/Dashboard/Pulse Collections).
  - `collection-ids` (optional): When provided, restricts the graph to only the specified collection IDs
  - `group-ids` (optional): When provided, restricts the graph to only the specified permission group IDs

  **Structure:**
  The graph has the structure:
  ```
  {:revision <int>
   :groups   {<group-id> {<collection-id> <:read|:write>
                          :root           <:read|:write>}}}
  ```

  Note: All Collections are returned at the same level of the 'graph', regardless of how the Collection hierarchy is
  structured. Collections do not inherit permissions from ancestor Collections in the same way data permissions are
  inherited (e.g. full `:read` perms for a Database implies `:read` perms for all its schemas); a 'child' object (e.g.
  schema) *cannot* have more restrictive permissions than its parent (e.g. Database). Child Collections *can* have
  more restrictive permissions than their parent."
  ([]
   (graph nil))

  ([collection-namespace :- [:maybe ms/KeywordOrString]]
   (graph collection-namespace nil nil))

  ([collection-namespace :- [:maybe ms/KeywordOrString]
    collection-ids :- [:maybe [:set [:or [:= :root] ms/PositiveInt]]]
    group-ids :- [:maybe [:set ms/PositiveInt]]]
   (let [include-root?    (or (nil? collection-ids)
                              (contains? collection-ids :root))
         root-object      (str "/collection/"
                               (when collection-namespace
                                 (str "namespace/" (name collection-namespace) "/"))
                               "root/")
         ids-without-root (some-> collection-ids (disj :root))
         chunks           (if (or (empty? ids-without-root)
                                  (<= (count ids-without-root) max-in-clause-size))
                            [ids-without-root]
                            (map set (partition-all max-in-clause-size ids-without-root)))
         init             {(u/the-id (perms-group/admin)) {:root :write}}]
     (->> (reduce (fn [accum id-chunk]
                    (reduce-graph-query accum collection-namespace include-root?
                                        root-object id-chunk group-ids))
                  init chunks)
          collection-permission-graph
          modify-instance-analytics-for-admins))))
