(ns metabase.permissions.models.collection.graph
  "Code for generating and updating the Collection permissions graph. See [[metabase.permissions.models.permissions]]
  for more details and for the code for generating and updating the *data* permissions graph."
  (:require
   [clojure.data :as data]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit]
   [metabase.permissions.models.collection-permission-graph-revision :as c-perm-revision]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.util :as perms.u]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               PERMISSIONS GRAPH                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def ^:private CollectionPermissions
  [:enum :write :read :none])

(def ^:private GroupPermissionsGraph
  "collection-id -> status"
  ; when doing a delta between old graph and new graph root won't always
  ; be present, which is why it's *optional*
  [:map-of [:or [:= :root] ms/PositiveInt] CollectionPermissions])

(def ^:private PermissionsGraph
  [:map {:closed true}
   [:revision {:optional true} [:maybe :int]]
   [:groups [:map-of ms/PositiveInt GroupPermissionsGraph]]])

;;; -------------------------------------------------- Fetch Graph ---------------------------------------------------
;;;

(defn- root-collection
  "Requiring resolve to break a circular dependency"
  []
  (var-get (requiring-resolve 'metabase.collections.models.collection/root-collection)))

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

(mu/defn graph :- PermissionsGraph
  "Fetch a graph representing the current permissions status for every group and all permissioned collections. This
  works just like the function of the same name in `metabase.permissions.models.permissions`; see also the documentation
  for that function.

  The graph is restricted to a given namespace by the optional `collection-namespace` param; by default, `nil`, which
  restricts it to the 'default' namespace containing normal Card/Dashboard/Pulse Collections.

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
   (let [include-root? (or (nil? collection-ids) (contains? collection-ids :root))
         root-object (str "/collection/"
                          (when collection-namespace
                            (str "namespace/" (name collection-namespace) "/"))
                          "root/")]
     (->> (t2/reducible-query
           {:with [[:eligible_collections
                    {:select [:id]
                     :from [:collection]
                     :where [:and
                             [:or [:= :type nil] [:not= :type [:inline "trash"]]]
                             (perms/audit-namespace-clause :namespace (u/qualified-name collection-namespace))
                             [:not :archived]
                             [:= :personal_owner_id nil]
                             (let [ids-without-root (disj collection-ids :root)]
                               (when (seq ids-without-root)
                                 [:in :id ids-without-root]))
                             [:not [:exists {:select [1]
                                             :from [[:collection :pc]]
                                             :where [:and
                                                     [:not= :pc.personal_owner_id nil]
                                                     [:like :collection.location
                                                      [:raw "CONCAT('/', pc.id, '/%')"]]]}]]]}]
                   [:relevant_permissions
                    {:select [:group_id :collection_id :perm_value]
                     :from [:permissions]
                     :where (into [:and
                                   [:= :perm_type [:inline "perms/collection-access"]]
                                   [:not= :collection_id nil]]
                                  (when (seq group-ids)
                                    [[:in :group_id group-ids]]))}]]
            :union-all
            [;; Query 1: Root collection permissions
             {:select [[:pg.id :group_id]
                       [nil :collection_id]
                       [[:max [:case [:= :p.object [:inline root-object]]
                               [:inline 1]
                               :else [:inline 0]]] :writable]
                       [[:max [:case [:= :p.object [:inline (str root-object "read/")]]
                               [:inline 1]
                               :else [:inline 0]]] :readable]]
              :from [[:permissions_group :pg]]
              :join [[:permissions :p] [:and
                                        [:= :p.group_id :pg.id]
                                        [:or [:= :p.object [:inline root-object]]
                                         [:= :p.object [:inline (str root-object "read/")]]]]]
              :where (into [:and
                            [[:inline include-root?]]]
                           (when (seq group-ids)
                             [[:in :pg.id group-ids]]))
              :group-by [:pg.id]}

                ;; Query 2: Regular collection permissions
             {:select [[:pg.id :group_id]
                       [:c.id :collection_id]
                       [[:max [:case [:= :p.perm_value [:inline "read-and-write"]]
                               [:inline 1]
                               :else [:inline 0]]] :writable]
                       [[:max [:case [:or [:= :p.perm_value [:inline "read-and-write"]]
                                      [:= :p.perm_value [:inline "read"]]]
                               [:inline 1]
                               :else [:inline 0]]] :readable]]
              :from [[:permissions_group :pg]]
              :join [[:relevant_permissions :p] [:= :p.group_id :pg.id]
                     [:eligible_collections :c] [:= :p.collection_id :c.id]]
              :where [:not= :c.id nil]
              :group-by [:pg.id :c.id]}

             ;; Query 3: That wacky Administrators group
             {:select [[(u/the-id (perms-group/admin)) :group_id]
                       [:c.id :collection_id]
                       [[:inline 1] :writable]
                       [[:inline 1] :readable]]
              :from [[:collection :c]]}]})
          (reduce (fn [accum {group-id :group_id collection-id :collection_id :keys [writable readable]}]
                    (assoc-in accum [group-id (or collection-id :root)]
                              (cond
                                (= writable 1) :write
                                (= readable 1) :read
                                :else :none)))
                  {(u/the-id (perms-group/admin)) {:root :write}})
          collection-permission-graph
          modify-instance-analytics-for-admins))))

;;; -------------------------------------------------- Update Graph --------------------------------------------------

(mu/defn- update-collection-permissions!
  "Update the permissions for group ID with `group-id` on collection with ID
  `collection-id` in the optional `collection-namespace` to `new-collection-perms`."
  [collection-namespace :- [:maybe ms/KeywordOrString]
   group-id :- ms/PositiveInt
   collection-id :- [:or [:= :root] ms/PositiveInt]
   new-collection-perms :- CollectionPermissions]
  (let [collection-id (if (= collection-id :root)
                        (assoc (root-collection) :namespace collection-namespace)
                        collection-id)]
    ;; remove whatever entry is already there (if any) and add a new entry if applicable
    (perms/revoke-collection-permissions! group-id collection-id)
    (case new-collection-perms
      :write (perms/grant-collection-readwrite-permissions! group-id collection-id)
      :read (perms/grant-collection-read-permissions! group-id collection-id)
      :none nil)))

(mu/defn- update-group-permissions!
  [collection-namespace :- [:maybe ms/KeywordOrString]
   group-id :- ms/PositiveInt
   new-group-perms :- GroupPermissionsGraph]
  (doseq [[collection-id new-perms] new-group-perms]
    (update-collection-permissions! collection-namespace group-id collection-id new-perms)))

(defenterprise update-audit-collection-permissions!
  "OSS implementation of `audit-db/update-audit-collection-permissions!`, which is an enterprise feature, so does nothing in the OSS
  version."
  metabase-enterprise.audit-app.permissions [_ _] ::noop)

(defn create-perms-revision!
  "Increments the current revision number and writes it to the database. This lets us track the permissions graph
  revision number, which is used for consistency checks when updating the graph."
  [current-revision-number]
  (when api/*current-user-id*
    (first (t2/insert-returning-instances! :model/CollectionPermissionGraphRevision
                                           :id (inc current-revision-number)
                                           :user_id api/*current-user-id*
                                           :before ""
                                           :after ""))))

(defn fill-revision-details!
  "Updates perm revision, this is used for logging/auditing purposes, and can be quite expensive, so in practice is
   called after the revision number is updated."
  [revision-id before changes]
  (future (t2/update! :model/CollectionPermissionGraphRevision revision-id {:before before :after changes})))

(defn- personal-collection-ids
  "Return a set of IDs from `collection-ids` that are personal Collections or descendants of personal Collections.
  These should never appear in permission graphs or be editable via the graph API."
  [collection-ids]
  (when (seq collection-ids)
    (t2/select-pks-set :model/Collection
                       {:where [:and
                                [:in :id collection-ids]
                                [:or [:not= :personal_owner_id nil]
                                 [:exists {:select [1]
                                           :from [[:collection :pc]]
                                           :where [:and
                                                   [:not= :pc.personal_owner_id nil]
                                                   [:like :collection.location
                                                    [:raw "CONCAT('/', pc.id, '/%')"]]]}]]]})))

(defn- remove-personal-collections-from-graph
  "Remove any personal collection IDs from the graph. Personal collections cannot be edited via the graph API."
  [graph collection-ids]
  (let [personal-ids (personal-collection-ids collection-ids)]
    (cond-> graph
      (seq personal-ids) (update :groups update-vals #(apply dissoc % personal-ids)))))

(defn- remove-collections-from-other-namespaces
  "Remove any collection IDs from the graph that belong to another namespace from the graph being updated."
  [graph collection-ids namespace]
  (let [other-ns-ids (when (seq collection-ids)
                       (t2/select-pks-set :model/Collection {:where [:and [:in :id collection-ids]
                                                                     (cond-> [:or [:not= :namespace (some-> namespace name)]]
                                                                       (some? namespace) (into [[:= :namespace nil]]))]}))]
    (cond-> graph
      (seq other-ns-ids) (update :groups update-vals #(apply dissoc % other-ns-ids)))))

(mu/defn update-graph!
  "Update the Collections permissions graph for Collections of `collection-namespace` (default `nil`, the 'default'
  namespace). This works just like [[metabase.models.permission/update-data-perms-graph!]], but for Collections;
  refer to that function's extensive documentation to get a sense for how this works.

  Personal collections and their descendants are automatically filtered out from the graph before processing,
  as they cannot be edited via the graph API.

  If there are no changes, returns nil.
  If there are changes, returns the future that is used to call `fill-revision-details!`.
  To run this synchronously deref the non-nil return value."
  ([new-graph]
   (update-graph! nil new-graph false))

  ([collection-namespace :- [:maybe ms/KeywordOrString]
    new-graph :- PermissionsGraph
    force? :- [:maybe boolean?]]
   (let [new-group-ids (-> new-graph :groups keys set)
         new-collection-ids (->> new-graph :groups vals (mapcat keys) set)
         filtered-new-graph (-> (remove-personal-collections-from-graph new-graph new-collection-ids)
                                (remove-collections-from-other-namespaces new-collection-ids collection-namespace))
         old-graph (graph collection-namespace new-collection-ids new-group-ids)
         [diff-old changes] (data/diff (:groups old-graph) (->> (:groups filtered-new-graph)
                                                                (filter (comp seq second))
                                                                (into {})))]
     (when-not force? (perms.u/check-revision-numbers old-graph filtered-new-graph))
     (when (seq changes)
       (let [revision-id (t2/with-transaction [_conn]
                           (doseq [[group-id changes] changes]
                             (update-audit-collection-permissions! group-id changes)
                             (update-group-permissions! collection-namespace group-id changes))
                           (:id (create-perms-revision! (:revision old-graph))))]
         ;; The graph is updated infrequently, but `diff-old` and `old-graph` can get huge on larger instances.
         (perms.u/log-permissions-changes diff-old changes)
         (fill-revision-details! revision-id (assoc old-graph :namespace collection-namespace) changes))))))
