(ns metabase.models.permissions
  (:require [clojure
             [data :as data]
             [string :as str]]
            [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.models
             [interface :as i]
             [permissions-group :as group]
             [permissions-revision :as perms-revision :refer [PermissionsRevision]]]
            [metabase.util :as u]
            [metabase.util
             [honeysql-extensions :as hx]
             [schema :as su]]
            [puppetlabs.i18n.core :refer [tru]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    UTIL FNS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Dynamic Vars --------------------------------------------------

(def ^:dynamic ^Boolean *allow-root-entries*
  "Show we allow permissions entries like `/`? By default, this is disallowed, but you can temporarily disable it here
   when creating the default entry for `Admin`."
  false)

(def ^:dynamic ^Boolean *allow-admin-permissions-changes*
  "Show we allow changes to be made to permissions belonging to the Admin group? By default this is disabled to
   prevent accidental tragedy, but you can enable it here when creating the default entry for `Admin`."
  false)


;;; --------------------------------------------------- Validation ---------------------------------------------------

(def ^:private ^:const valid-object-path-patterns
  [#"^/db/(\d+)/$"                                              ; permissions for the entire DB -- native and all schemas
   #"^/db/(\d+)/native/$"                                       ; permissions to create new native queries for the DB
   #"^/db/(\d+)/schema/$"                                       ; permissions for all schemas in the DB
   #"^/db/(\d+)/schema/([^\\/]*)/$"                             ; permissions for a specific schema
   #"^/db/(\d+)/schema/([^\\/]*)/table/(\d+)/$"                 ; FULL permissions for a specific table
   #"^/db/(\d+)/schema/([^\\/]*)/table/(\d+)/read/$"            ; Permissions to fetch the Metadata for a specific Table
   #"^/db/(\d+)/schema/([^\\/]*)/table/(\d+)/query/$"           ; Permissions to run any sort of query against a Table
   #"^/db/(\d+)/schema/([^\\/]*)/table/(\d+)/query/segmented/$" ; Permissions to run a query against a Table using GTAP
   #"^/collection/(\d+)/$"                                      ; readwrite permissions for a collection
   #"^/collection/(\d+)/read/$"                                 ; read permissions for a collection
   #"^/collection/root/$"                                       ; readwrite permissions for the 'Root' Collection (things with `nil` collection_id)
   #"^/collection/root/read/$"])                                ; read permissions for the 'Root' Collection

(defn valid-object-path?
  "Does OBJECT-PATH follow a known, allowed format to an *object*?
   (The root path, \"/\", is not considered an object; this returns `false` for it)."
  ^Boolean [^String object-path]
  (boolean (when (and (string? object-path)
                      (seq object-path))
             (some (u/rpartial re-matches object-path)
                   valid-object-path-patterns))))

(def ObjectPath
  "Schema for a valid permissions path to an object."
  (s/pred valid-object-path? "Valid permissions object path."))

(def UserPath
  "Schema for a valid permissions path that a user might possess in their `*current-user-permissions-set*`. This is the
  same as what's allowed for `ObjectPath` but also includes root permissions, which admins will have."
  (s/pred #(or (= % "/") (valid-object-path? %))
          "Valid user permissions path."))

(defn- assert-not-admin-group
  "Check to make sure the `:group_id` for PERMISSIONS entry isn't the admin group."
  [{:keys [group_id]}]
  (when (and (= group_id (:id (group/admin)))
             (not *allow-admin-permissions-changes*))
    (throw (ex-info (tru "You cannot create or revoke permissions for the 'Admin' group.")
             {:status-code 400}))))

(defn- assert-valid-object
  "Check to make sure the value of `:object` for PERMISSIONS entry is valid."
  [{:keys [object]}]
  (when (and object
             (not (valid-object-path? object))
             (or (not= object "/")
                 (not *allow-root-entries*)))
    (throw (ex-info (tru "Invalid permissions object path: ''{0}''." object)
             {:status-code 400}))))

(defn- assert-valid
  "Check to make sure this PERMISSIONS entry is something that's allowed to be saved (i.e. it has a valid `:object`
   path and it's not for the admin group)."
  [permissions]
  (assert-not-admin-group permissions)
  (assert-valid-object permissions))

;;; ------------------------------------------------- Path Util Fns --------------------------------------------------

(def ^:private MapOrID
  (s/cond-pre su/Map su/IntGreaterThanZero))

(s/defn object-path :- ObjectPath
  "Return the permissions path for a Database, schema, or Table."
  ([database-or-id :- MapOrID]
   (str "/db/" (u/get-id database-or-id) "/"))
  ([database-or-id :- MapOrID, schema-name :- (s/maybe s/Str)]
   (str (object-path database-or-id) "schema/" schema-name "/"))
  ([database-or-id :- MapOrID, schema-name :- (s/maybe s/Str), table-or-id :- MapOrID]
   (str (object-path database-or-id schema-name) "table/" (u/get-id table-or-id) "/" )))

(s/defn adhoc-native-query-path :- ObjectPath
  "Return the native query read/write permissions path for a database.
   This grants you permissions to run arbitary native queries."
  [database-or-id :- MapOrID]
  (str (object-path database-or-id) "native/"))

(s/defn all-schemas-path :- ObjectPath
  "Return the permissions path for a database that grants full access to all schemas."
  [database-or-id :- MapOrID]
  (str (object-path database-or-id) "schema/"))

(s/defn collection-readwrite-path :- ObjectPath
  "Return the permissions path for *readwrite* access for a COLLECTION-OR-ID."
  [collection-or-id :- MapOrID]
  (str "/collection/"
       (if (get collection-or-id :metabase.models.collection/is-root?)
         "root"
         (u/get-id collection-or-id))
       "/"))

(s/defn collection-read-path :- ObjectPath
  "Return the permissions path for *read* access for a COLLECTION-OR-ID."
  [collection-or-id :- MapOrID]
  (str (collection-readwrite-path collection-or-id) "read/"))


;;; -------------------------------------------- Permissions Checking Fns --------------------------------------------

(defn is-permissions-for-object?
  "Does PERMISSIONS-PATH grant *full* access for OBJECT-PATH?"
  [permissions-path object-path]
  (str/starts-with? object-path permissions-path))

(defn is-partial-permissions-for-object?
  "Does PERMISSIONS-PATH grant access full access for OBJECT-PATH *or* for a descendant of OBJECT-PATH?"
  [permissions-path object-path]
  (or (is-permissions-for-object? permissions-path object-path)
      (str/starts-with? permissions-path object-path)))


(defn is-permissions-set?
  "Is PERMISSIONS-SET a valid set of permissions object paths?"
  ^Boolean [permissions-set]
  (and (set? permissions-set)
       (every? (fn [path]
                 (or (= path "/")
                     (valid-object-path? path)))
               permissions-set)))


(defn set-has-full-permissions?
  "Does PERMISSIONS-SET grant *full* access to object with PATH?"
  {:style/indent 1}
  ^Boolean [permissions-set path]
  (boolean (some (u/rpartial is-permissions-for-object? path) permissions-set)))

(defn set-has-partial-permissions?
  "Does PERMISSIONS-SET grant access full access to object with PATH *or* to a descendant of it?"
  {:style/indent 1}
  ^Boolean [permissions-set path]
  (boolean (some (u/rpartial is-partial-permissions-for-object? path) permissions-set)))


(s/defn set-has-full-permissions-for-set? :- s/Bool
  "Do the permissions paths in PERMISSIONS-SET grant *full* access to all the object paths in OBJECT-PATHS-SET?"
  {:style/indent 1}
  [permissions-set :- #{UserPath}, object-paths-set :- #{ObjectPath}]
  (every? (partial set-has-full-permissions? permissions-set)
          object-paths-set))

(s/defn set-has-partial-permissions-for-set? :- s/Bool
  "Do the permissions paths in PERMISSIONS-SET grant *partial* access to all the object paths in OBJECT-PATHS-SET?
   (PERMISSIONS-SET must grant partial access to *every* object in OBJECT-PATH-SETS set)."
  {:style/indent 1}
  [permissions-set :- #{UserPath}, object-paths-set :- #{ObjectPath}]
  (every? (partial set-has-partial-permissions? permissions-set)
          object-paths-set))

(s/defn perms-objects-set-for-parent-collection :- #{ObjectPath}
  "Implementation of `IModel` `perms-objects-set` for models with a `collection_id`, such as Card, Dashboard, or Pulse.
  This simply returns the `perms-objects-set` of the parent Collection (based on `collection_id`), or for the Root
  Collection if `collection_id` is `nil`."
  [this          :- {:collection_id (s/maybe su/IntGreaterThanZero), s/Keyword s/Any}
   read-or-write :- (s/enum :read :write)]
  ;; based on value of read-or-write determine the approprite function used to calculate the perms path
  (let [path-fn (case read-or-write
                  :read  collection-read-path
                  :write collection-readwrite-path)]
    ;; now pass that function our collection_id if we have one, or if not, pass it an object representing the Root
    ;; Collection
    #{(path-fn (or (:collection_id this)
                   {:metabase.models.collection/is-root? true}))}))

(def IObjectPermissionsForParentCollection
  "Implementation of `IObjectPermissions` for objects that have a `collection_id`, and thus, a parent Collection.
   Using this will mean the current User is allowed to read or write these objects if they are allowed to read or
  write their parent Collection."
  (merge i/IObjectPermissionsDefaults
         ;; TODO - we use these same partial implementations of `can-read?` and `can-write?` all over the place for
         ;; different models. Consider making them a mixin of some sort. (I was going to do this but I couldn't come
         ;; up with a good name for the Mixin. - Cam)
         {:can-read?         (partial i/current-user-has-full-permissions? :read)
          :can-write?        (partial i/current-user-has-full-permissions? :write)
          :perms-objects-set perms-objects-set-for-parent-collection}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               ENTITY + LIFECYCLE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(models/defmodel Permissions :permissions)

(defn- pre-insert [permissions]
  (u/prog1 permissions
    (assert-valid permissions)
    (log/debug (u/format-color 'green "Granting permissions for group %d: %s" (:group_id permissions) (:object permissions)))))

(defn- pre-update [_]
  (throw (Exception. (str (tru "You cannot update a permissions entry!")
                          (tru "Delete it and create a new one.")))))

(defn- pre-delete [permissions]
  (log/debug (u/format-color 'red "Revoking permissions for group %d: %s" (:group_id permissions) (:object permissions)))
  (assert-not-admin-group permissions))


(u/strict-extend (class Permissions)
  models/IModel (merge models/IModelDefaults
                   {:pre-insert         pre-insert
                    :pre-update         pre-update
                    :pre-delete pre-delete}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  GRAPH SCHEMA                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private TablePermissionsGraph
  (s/enum :none :all))

(def ^:private SchemaPermissionsGraph
  (s/cond-pre (s/enum :none :all)
              {su/IntGreaterThanZero TablePermissionsGraph}))

(def ^:private NativePermissionsGraph
  (s/enum :write :none))

(def ^:private DBPermissionsGraph
  {(s/optional-key :native)  NativePermissionsGraph
   (s/optional-key :schemas) (s/cond-pre (s/enum :all :none)
                                         {s/Str SchemaPermissionsGraph})})

(def ^:private GroupPermissionsGraph
  {su/IntGreaterThanZero DBPermissionsGraph})

(def ^:private PermissionsGraph
  {:revision s/Int
   :groups   {su/IntGreaterThanZero GroupPermissionsGraph}})

;; The "Strict" versions of the various graphs below are intended for schema checking when *updating* the permissions
;; graph. In other words, we shouldn't be stopped from returning the graph if it violates the "strict" rules, but we
;; *should* refuse to update the graph unless it matches the strict schema.
;;
;; TODO - It might be possible at some point in the future to just use the strict versions everywhere

(defn- check-native-and-schemas-permissions-allowed-together [{:keys [native schemas]}]
  ;; Only do the check when we have both, e.g. when the entire graph is coming in
  (if-not (and native schemas)
    :ok
    (match [native schemas]
      [:write :all]  :ok
      [:write _]     (log/warn "Invalid DB permissions: if you have write access for native queries, you must have full data access.")
      [:read  :none] (log/warn "Invalid DB permissions: if you have readonly native query access, you must also have data access.")
      [_      _]     :ok)))

(def ^:private StrictDBPermissionsGraph
  (s/constrained DBPermissionsGraph
                 check-native-and-schemas-permissions-allowed-together
                 "DB permissions with a valid combination of values for :native and :schemas"))

(def ^:private StrictGroupPermissionsGraph
  {su/IntGreaterThanZero StrictDBPermissionsGraph})

(def ^:private StrictPermissionsGraph
  {:revision s/Int
   :groups   {su/IntGreaterThanZero StrictGroupPermissionsGraph}})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  GRAPH FETCH                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- permissions-for-path
  "Given a PERMISSIONS-SET of all allowed permissions paths for a Group, return the corresponding permissions status
   for an object with PATH."
  [permissions-set path]
  (u/prog1 (cond
             (set-has-full-permissions? permissions-set path)    :all
             (set-has-partial-permissions? permissions-set path) :some
             :else                                               :none)))

(defn- table->adhoc-native-query-path [table] (adhoc-native-query-path (:db_id table)))
(defn- table->schema-object-path      [table] (object-path (:db_id table) (:schema table)))
(defn- table->table-object-path       [table] (object-path (:db_id table) (:schema table) (:id table)))
(defn- table->all-schemas-path        [table] (all-schemas-path (:db_id table)))


(s/defn ^:private schema-graph :- SchemaPermissionsGraph [permissions-set tables]
  (case (permissions-for-path permissions-set (table->schema-object-path (first tables)))
    :all  :all
    :none :none
    :some (into {} (for [table tables]
                     {(u/get-id table) (permissions-for-path permissions-set (table->table-object-path table))}))))

(s/defn ^:private db-graph :- DBPermissionsGraph [permissions-set tables]
  {:native  (case (permissions-for-path permissions-set (table->adhoc-native-query-path (first tables)))
              :all  :write
              :some :read
              :none :none)
   :schemas (case (permissions-for-path permissions-set (table->all-schemas-path (first tables)))
              :all  :all
              :none :none
              (into {} (for [[schema tables] (group-by :schema tables)]
                         ;; if schema is nil, replace it with an empty string, since that's how it will get encoded in JSON :D
                         {(str schema) (schema-graph permissions-set tables)})))})

(s/defn ^:private group-graph :- GroupPermissionsGraph [permissions-set tables]
  (m/map-vals (partial db-graph permissions-set)
              tables))

;; TODO - if a DB has no tables, then it won't show up in the permissions graph!
(s/defn graph :- PermissionsGraph
  "Fetch a graph representing the current permissions status for every group and all permissioned databases."
  []
  (let [permissions (db/select [Permissions :group_id :object])
        tables      (group-by :db_id (db/select ['Table :schema :id :db_id]))]
    {:revision (perms-revision/latest-id)
     :groups   (into {} (for [group-id (db/select-ids 'PermissionsGroup)]
                          (let [group-permissions-set (set (for [perms permissions
                                                                 :when (= (:group_id perms) group-id)]
                                                             (:object perms)))]
                            {group-id (group-graph group-permissions-set tables)})))}))



;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  GRAPH UPDATE                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

;; TODO - why does this take a PATH when everything else takes PATH-COMPONENTS or IDs?
(s/defn delete-related-permissions!
  "Delete all permissions for `group-or-id` for ancestors or descendant objects of object with `path`.
   You can optionally include `other-conditions`, which are anded into the filter clause, to further restrict what is
   deleted."
  {:style/indent 2}
  [group-or-id :- (s/cond-pre su/Map su/IntGreaterThanZero), path :- ObjectPath, & other-conditions]
  (let [where {:where (apply list
                             :and
                             [:= :group_id (u/get-id group-or-id)]
                             [:or
                              [:like path (hx/concat :object (hx/literal "%"))]
                              [:like :object (str path "%")]]
                             other-conditions)}]
    (when-let [revoked (db/select-field :object Permissions where)]
      (log/debug (u/format-color 'red "Revoking permissions for group %d: %s" (u/get-id group-or-id) revoked))
      (db/delete! Permissions where))))

(defn revoke-permissions!
  "Revoke all permissions for GROUP-OR-ID to object with PATH-COMPONENTS, *including* related permissions."
  [group-or-id & path-components]
  (delete-related-permissions! group-or-id (apply object-path path-components)))

(defn grant-permissions!
  "Grant permissions to GROUP-OR-ID to an object."
  ([group-or-id db-id schema & more]
   (grant-permissions! group-or-id (apply object-path db-id schema more)))
  ([group-or-id path]
   (try
     (db/insert! Permissions
       :group_id (u/get-id group-or-id)
       :object   path)
     ;; on some occasions through weirdness we might accidentally try to insert a key that's already been inserted
     (catch Throwable e
       (log/error (u/format-color 'red "Failed to grant permissions: %s" (.getMessage e)))))))

(defn revoke-native-permissions!
  "Revoke all native query permissions for GROUP-OR-ID to database with DATABASE-ID."
  [group-or-id database-id]
  (delete-related-permissions! group-or-id (adhoc-native-query-path database-id)))

(defn grant-native-readwrite-permissions!
  "Grant full readwrite permissions for GROUP-OR-ID to database with DATABASE-ID."
  [group-or-id database-id]
  (grant-permissions! group-or-id (adhoc-native-query-path database-id)))

(defn revoke-db-schema-permissions!
  "Remove all permissions entires for a DB and *any* child objects.
   This does *not* revoke native permissions; use `revoke-native-permssions!` to do that."
  [group-or-id database-id]
  ;; TODO - if permissions for this DB are DB root entries like `/db/1/` won't this end up removing our native perms?
  (delete-related-permissions! group-or-id (object-path database-id)
    [:not= :object (adhoc-native-query-path database-id)]))

(s/defn grant-permissions-for-all-schemas!
  "Grant full permissions for all schemas belonging to this database.
   This does *not* grant native permissions; use `grant-native-readwrite-permissions!` to do that."
  [group-id :- su/IntGreaterThanZero, database-id :- su/IntGreaterThanZero]
  (grant-permissions! group-id (all-schemas-path database-id)))

(s/defn grant-full-db-permissions!
  "Grant full access to the database, including all schemas and readwrite native access."
  [group-id :- su/IntGreaterThanZero, database-id :- su/IntGreaterThanZero]
  (grant-permissions! group-id (object-path database-id)))

(defn- check-not-personal-collection-or-descendant
  "Check whether `collection-or-id` refers to a Personal Collection; if so, throw an Exception. This is done because we
  *should* never be editing granting/etc. permissions for *Personal* Collections to entire Groups! Their owner will
  get implicit permissions automatically, and of course admins will be able to see them,but a whole group should never
  be given some sort of access."
  [collection-or-id]
  ;; don't apply this check to the Root Collection, because it's never personal
  (when-not (:metabase.models.collection/is-root? collection-or-id)
    ;; ok, once we've confirmed this isn't the Root Collection, see if it's in the DB with a personal_owner_id
    (when ((resolve 'metabase.models.collection/is-personal-collection-or-descendant-of-one?)
           (if (map? collection-or-id)
             collection-or-id
             (db/select-one 'Collection :id (u/get-id collection-or-id))))
      (throw (Exception. (str (tru "You cannot edit permissions for a Personal Collection or its descendants.")))))))

(defn revoke-collection-permissions!
  "Revoke all access for `group-or-id` to a Collection."
  [group-or-id collection-or-id]
  (check-not-personal-collection-or-descendant collection-or-id)
  (delete-related-permissions! group-or-id (collection-readwrite-path collection-or-id)))

(defn grant-collection-readwrite-permissions!
  "Grant full access to a Collection, which means a user can view all Cards in the Collection and add/remove Cards."
  [group-or-id collection-or-id]
  (check-not-personal-collection-or-descendant collection-or-id)
  (grant-permissions! (u/get-id group-or-id) (collection-readwrite-path collection-or-id)))

(defn grant-collection-read-permissions!
  "Grant read access to a Collection, which means a user can view all Cards in the Collection."
  [group-or-id collection-or-id]
  (check-not-personal-collection-or-descendant collection-or-id)
  (grant-permissions! (u/get-id group-or-id) (collection-read-path collection-or-id)))


;;; ----------------------------------------------- Graph Updating Fns -----------------------------------------------

(s/defn ^:private update-table-perms!
  [group-id        :- su/IntGreaterThanZero
   db-id           :- su/IntGreaterThanZero
   schema          :- s/Str
   table-id        :- su/IntGreaterThanZero
   new-table-perms :- SchemaPermissionsGraph]
  (case new-table-perms
    :all  (grant-permissions! group-id db-id schema table-id)
    :none (revoke-permissions! group-id db-id schema table-id)))

(s/defn ^:private update-schema-perms!
  [group-id         :- su/IntGreaterThanZero
   db-id            :- su/IntGreaterThanZero
   schema           :- s/Str
   new-schema-perms :- SchemaPermissionsGraph]
  (cond
    (= new-schema-perms :all)  (do (revoke-permissions! group-id db-id schema)  ; clear out any existing related permissions
                                   (grant-permissions!  group-id db-id schema)) ; then grant full perms for the schema
    (= new-schema-perms :none) (revoke-permissions! group-id db-id schema)
    (map? new-schema-perms)    (doseq [[table-id table-perms] new-schema-perms]
                                 (update-table-perms! group-id db-id schema table-id table-perms))))

(s/defn ^:private update-native-permissions!
  [group-id :- su/IntGreaterThanZero, db-id :- su/IntGreaterThanZero, new-native-perms :- NativePermissionsGraph]
  ;; revoke-native-permissions! will delete all entires that would give permissions for native access. Thus if you had
  ;; a root DB entry like `/db/11/` this will delete that too. In that case we want to create a new full schemas entry
  ;; so you don't lose access to all schemas when we modify native access.
  (let [has-full-access? (db/exists? Permissions :group_id group-id, :object (object-path db-id))]
    (revoke-native-permissions! group-id db-id)
    (when has-full-access?
      (grant-permissions-for-all-schemas! group-id db-id)))
  (case new-native-perms
    :write (grant-native-readwrite-permissions! group-id db-id)
    :none  nil))


(s/defn ^:private update-db-permissions!
  [group-id :- su/IntGreaterThanZero, db-id :- su/IntGreaterThanZero, new-db-perms :- StrictDBPermissionsGraph]
  (when-let [new-native-perms (:native new-db-perms)]
    (update-native-permissions! group-id db-id new-native-perms))
  (when-let [schemas (:schemas new-db-perms)]
    (cond
      (= schemas :all)  (do (revoke-db-schema-permissions! group-id db-id)
                            (grant-permissions-for-all-schemas! group-id db-id))
      (= schemas :none) (revoke-db-schema-permissions! group-id db-id)
      (map? schemas)    (doseq [schema (keys schemas)]
                          (update-schema-perms! group-id db-id schema (get-in new-db-perms [:schemas schema]))))))

(s/defn ^:private update-group-permissions!
  [group-id :- su/IntGreaterThanZero, new-group-perms :- StrictGroupPermissionsGraph]
  (doseq [[db-id new-db-perms] new-group-perms]
    (update-db-permissions! group-id db-id new-db-perms)))


(defn check-revision-numbers
  "Check that the revision number coming in as part of NEW-GRAPH matches the one from OLD-GRAPH.
   This way we can make sure people don't submit a new graph based on something out of date,
   which would otherwise stomp over changes made in the interim.
   Return a 409 (Conflict) if the numbers don't match up."
  [old-graph new-graph]
  (when (not= (:revision old-graph) (:revision new-graph))
    (throw (ex-info (str (tru "Looks like someone else edited the permissions and your data is out of date.")
                         (tru "Please fetch new data and try again."))
             {:status-code 409}))))

(defn- save-perms-revision!
  "Save changes made to the permissions graph for logging/auditing purposes.
   This doesn't do anything if `*current-user-id*` is unset (e.g. for testing or REPL usage)."
  [current-revision old new]
  (when *current-user-id*
    (db/insert! PermissionsRevision
      :id     (inc current-revision) ; manually specify ID here so if one was somehow inserted in the meantime in the fraction of a second
      :before  old                   ; since we called `check-revision-numbers` the PK constraint will fail and the transaction will abort
      :after   new
      :user_id *current-user-id*)))

(defn log-permissions-changes
  "Log changes to the permissions graph."
  [old new]
  (log/debug (format "Changing permissions: 🔏\nFROM:\n%s\nTO:\n%s\n"
                     (u/pprint-to-str 'magenta old)
                     (u/pprint-to-str 'blue new))))

(s/defn update-graph!
  "Update the permissions graph, making any changes neccesary to make it match NEW-GRAPH.
   This should take in a graph that is exactly the same as the one obtained by `graph` with any changes made as
   needed. The graph is revisioned, so if it has been updated by a third party since you fetched it this function will
   fail and return a 409 (Conflict) exception. If nothing needs to be done, this function returns `nil`; otherwise it
   returns the newly created `PermissionsRevision` entry."
  ([new-graph :- StrictPermissionsGraph]
   (let [old-graph (graph)
         [old new] (data/diff (:groups old-graph) (:groups new-graph))]
     (when (or (seq old) (seq new))
       (log-permissions-changes old new)
       (check-revision-numbers old-graph new-graph)
       (db/transaction
         (doseq [[group-id changes] new]
           (update-group-permissions! group-id changes))
         (save-perms-revision! (:revision old-graph) old new)))))
  ;; The following arity is provided soley for convenience for tests/REPL usage
  ([ks :- [s/Any], new-value]
   (update-graph! (assoc-in (graph) (cons :groups ks) new-value))))
