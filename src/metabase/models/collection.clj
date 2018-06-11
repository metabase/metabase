(ns metabase.models.collection
  (:refer-clojure :exclude [ancestors descendants])
  (:require [clojure
             [data :as data]
             [string :as str]]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.api.common :as api :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.models
             [collection-revision :as collection-revision :refer [CollectionRevision]]
             [interface :as i]
             [permissions :as perms]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [puppetlabs.i18n.core :refer [trs tru]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]]))

(def ^:private ^:const collection-slug-max-length
  "Maximum number of characters allowed in a Collection `slug`."
  254)

(models/defmodel Collection :collection)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Slug & Hex Color & Validation                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:const ^java.util.regex.Pattern hex-color-regex
  "Regex for a valid value of `:color`, a 7-character hex string including the preceding hash sign."
  #"^#[0-9A-Fa-f]{6}$")

(defn- assert-valid-hex-color [^String hex-color]
  (when (or (not (string? hex-color))
            (not (re-matches hex-color-regex hex-color)))
    (throw (ex-info (tru "Invalid color")
             {:status-code 400, :errors {:color (tru "must be a valid 6-character hex color code")}}))))

(defn- slugify [collection-name]
  ;; double-check that someone isn't trying to use a blank string as the collection name
  (when (str/blank? collection-name)
    (throw (ex-info (tru "Collection name cannot be blank!")
             {:status-code 400, :errors {:name (tru "cannot be blank")}})))
  (u/slugify collection-name collection-slug-max-length))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Nested Collections: Location Paths                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; "Location Paths" are strings that keep track of where a Colllection lives in a filesystem-like hierarchy. Almost
;; all of our backend code does not need to know this and can act as if there is no Collection hierarchy; it is,
;; however, presented as such in the UI. Perhaps it is best to think of the hierarchy as a façade.
;;
;; For example, Collection 30 might have a `location` like `/10/20/`, which means it's the child of Collection 20, who
;; itself is the child of Collection 10. Note that the `location` does not include the ID of Collection 30 itself.
;;
;; Storing the relationship in this manner, rather than with foreign keys such as `:parent_id`, allows us to
;; efficiently fetch all ancestors or descendants of a Collection without having to make multiple DB calls (e.g. to
;; fetch a grandparent, you'd first have to fetch its parent to get their `parent_id`).
;;
;; The following functions are useful for working with the Collection `location`, breaking it out into component IDs,
;; assembling IDs into a location path, and so forth.

(defn- unchecked-location-path->ids
  "*** Don't use this directly! Instead use `location-path->ids`. ***

  'Explode' a `location-path` into a sequence of Collection IDs, and parse them as integers. THIS DOES NOT VALIDATE
  THAT THE PATH OR RESULTS ARE VALID. This unchecked version exists solely to power the other version below."
  [location-path]
  (for [^String id-str (rest (str/split location-path #"/"))]
    (Integer/parseInt id-str)))

(defn- valid-location-path? [s]
  (and (string? s)
       (seq s)
       (or (= s "/")
           (and (re-matches #"/(\d+/)*" s)
                (apply distinct? (unchecked-location-path->ids s))))))

(def LocationPath
  "Schema for a directory-style 'path' to the location of a Collection."
  (s/pred valid-location-path?))

(s/defn location-path :- LocationPath
  "Build a 'location path' from a sequence of `collections-or-ids`.

     (location-path 10 20) ; -> \"/10/20/\""
  [& collections-or-ids :- [(s/cond-pre su/IntGreaterThanZero su/Map)]]
  (if-not (seq collections-or-ids)
    "/"
    (str
     "/"
     (str/join "/" (for [collection-or-id collections-or-ids]
                     (u/get-id collection-or-id)))
     "/")))

(s/defn location-path->ids :- [su/IntGreaterThanZero]
  "'Explode' a `location-path` into a sequence of Collection IDs, and parse them as integers.

     (location-path->ids \"/10/20/\") ; -> [10 20]"
  [location-path :- LocationPath]
  (unchecked-location-path->ids location-path))

(s/defn location-path->parent-id :- (s/maybe su/IntGreaterThanZero)
  "Given a `location-path` fetch the ID of the direct of a Collection.

     (location-path->parent-id \"/10/20/\") ; -> 20"
  [location-path :- LocationPath]
  (last (location-path->ids location-path)))

(s/defn all-ids-in-location-path-are-valid? :- s/Bool
  "Do all the IDs in `location-path` belong to actual Collections? (This requires a DB call to check this, so this
  should only be used when creating/updating a Collection. Don't use this for casual schema validation.)"
  [location-path :- LocationPath]
  (or
   ;; if location is just the root Collection there are no IDs in the path, so nothing to check
   (= location-path "/")
   ;; otherwise get all the IDs in the path and then make sure the count Collections with those IDs matches the number
   ;; of IDs
   (let [ids (location-path->ids location-path)]
     (= (count ids)
        (db/count Collection :id [:in ids])))))

(defn- assert-valid-location
  "Assert that the `location` property of a `collection`, if specified, is valid. This checks that it is valid both from
  a schema standpoint, and from a 'do the referenced Collections exist' standpoint. Intended for use as part of
  `pre-update` and `pre-insert`."
  [{:keys [location], :as collection}]
  ;; if setting/updating the `location` of this Collection make sure it matches the schema for valid location paths
  (when (contains? collection :location)
    (when-not (valid-location-path? location)
      (throw
       (ex-info (tru "Invalid Collection location: path is invalid.")
         {:status-code 400
          :errors      {:location (tru "Invalid Collection location: path is invalid.")}})))
    ;; if this is a Personal Collection it's only allowed to go in the Root Collection: you can't put it anywhere else!
    (when (contains? collection :personal_owner_id)
      (when-not (= location "/")
        (throw
         (ex-info (tru "You cannot move a Personal Collection.")
           {:status-code 400
            :errors      {:location (tru "You cannot move a Personal Collection.")}}))))
    ;; Also make sure that all the IDs referenced in the Location path actually correspond to real Collections
    (when-not (all-ids-in-location-path-are-valid? location)
      (throw
       (ex-info (tru "Invalid Collection location: some or all ancestors do not exist.")
         {:status-code 404
          :errors      {:location (tru "Invalid Collection location: some or all ancestors do not exist.")}})))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Nested Collections: "Effective" Location Paths                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; "Effective" Location Paths are location paths for Collections that exclude the IDs of Collections the current user
;; isn't allowed to see.
;;
;; For example, if a Collection has a `location` of `/10/20/30/`, and the current User is allowed to see Collections
;; 10 and 30, but not 20, we will show them an "effective" location path of `/10/30/`. This is used for things like
;; breadcrumbing in the frontend.

(def VisibleCollections
  "Includes the possible values for visible collections, either `:all` or a set of ids"
  (s/cond-pre (s/eq :all) #{su/IntGreaterThanZero}))

(s/defn permissions-set->visible-collection-ids :- VisibleCollections
  "Given a `permissions-set` (presumably those of the current user), return a set of IDs of Collections that the
  permissions set allows you to view. For those with *root* permissions (e.g., an admin), this function will return
  `:all`, signifying that you are allowed to view all Collections.

    (permissions-set->visible-collection-ids #{\"/collection/10/\"}) ; -> #{10}
    (permissions-set->visible-collection-ids #{\"/\"})               ; -> :all"
  [permissions-set :- #{perms/UserPath}]
  (if (contains? permissions-set "/")
    :all
    (set (for [path  permissions-set
               :let  [[_ id-str] (re-matches #"/collection/(\d+)/(read/)?" path)]
               :when id-str]
           (Integer/parseInt id-str)))))

(s/defn effective-location-path :- LocationPath
  "Given a `location-path` and a set of Collection IDs one is allowed to view (obtained from
  `permissions-set->visibile-collection-ids` above), calculate the 'effective' location path (excluding IDs of
  Collections for which we do not have read perms) we should show to the User.

  When called with a single argument, `collection`, this is used as a hydration function to hydrate
  `:effective_location`."
  {:hydrate :effective_location}
  ([collection :- su/Map]
   (effective-location-path (:location collection)
                            (permissions-set->visible-collection-ids @*current-user-permissions-set*)))

  ([real-location-path :- LocationPath, allowed-collection-ids :- (s/cond-pre (s/eq :all) #{su/IntGreaterThanZero})]
   (if (= allowed-collection-ids :all)
     real-location-path
     (apply location-path (for [id    (location-path->ids real-location-path)
                                :when (contains? allowed-collection-ids id)]
                            id)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                          Nested Collections: Ancestors, Childrens, Child Collections                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:hydrate ancestors :- [CollectionInstance]
  "Fetch ancestors (parent, grandparent, etc.) of a `collection`. These are returned in order starting with the
  highest-level (e.g. most distant) ancestor."
  [{:keys [location]}]
  (when-let [ancestor-ids (seq (location-path->ids location))]
    (db/select [Collection :name :id] :id [:in ancestor-ids] {:order-by [:%lower.name]})))

(s/defn effective-ancestors :- [CollectionInstance]
  "Fetch the ancestors of a `collection`, filtering out any ones the current User isn't allowed to see. This is used
  in the UI to power the 'breadcrumb' path to the location of a given Collection. For example, suppose we have four
  Collections, nested like:

    A > B > C > D

  The ancestors of D are:

    A > B > C

  If the current User is allowed to see A and C, but not B, `effective-ancestors` of D will be:

    A > C

  Thus the existence of C will be kept hidden from the current User, and for all intents and purposes the current User
  can effectively treat A as the parent of C."
  {:hydrate :effective_ancestors}
  [collection]
  (filter i/can-read? (ancestors collection)))

(def root-collection
  "Special placeholder map representing the Root Collection, which isn't really a real Collection."
  {::is-root? true})

(defn- is-root-collection? [m]
  (boolean (::is-root? m)))

(def ^:private CollectionWithLocation
  (s/pred (fn [collection]
            (and (map? collection)
                 (or (::is-root? collection)
                     (valid-location-path? (:location collection)))))
          "Collection with a valid `:location` or the Root Collection"))

(s/defn children-location :- LocationPath
  "Given a `collection` return a location path that should match the `:location` value of all the children of the
  Collection.

     (children-location collection) ; -> \"/10/20/30/;

     ;; To get children of this collection:
     (db/select Collection :location \"/10/20/30/\")"
  [{:keys [location], :as collection} :- CollectionWithLocation]
  (if (is-root-collection? collection)
    "/"
    (str location (u/get-id collection) "/")))

(def ^:private Children
  (s/both
   CollectionInstance
   {:children #{(s/recursive #'Children)}
    s/Keyword s/Any}))

(s/defn ^:private descendants :- #{Children}
  "Return all descendant Collections of a `collection`, including children, grandchildren, and so forth. This is done
  primarily to power the `effective-children` feature below, and thus the descendants are returned in a hierarchy,
  rather than as a flat set. e.g. results will be something like:

       +-> B
       |
    A -+-> C -+-> D -> E
              |
              +-> F -> G

  where each letter represents a Collection, and the arrows represent values of its respective `:children`
  set."
  [collection :- CollectionWithLocation]
  ;; first, fetch all the descendants of the `collection`, and build a map of location -> children. This will be used
  ;; so we can fetch the immediate children of each Collection
  (let [location->children (group-by :location (db/select [Collection :name :id :location]
                                                 {:where
                                                  [:and
                                                   [:like :location (str (children-location collection) "%")]
                                                   ;; Only return the Personal Collection belonging to the Current
                                                   ;; User, regardless of whether we should actually be allowed to see
                                                   ;; it (e.g., admins have perms for all Collections). This is done
                                                   ;; to keep the Root Collection View for admins from getting crazily
                                                   ;; cluttered with Personal Collections belonging to randos
                                                   [:or
                                                    [:= :personal_owner_id nil]
                                                    [:= :personal_owner_id *current-user-id*]]]}))
        ;; Next, build a function to add children to a given `coll`. This function will recursively call itself to add
        ;; children to each child
        add-children       (fn add-children [coll]
                             (let [children (get location->children (children-location coll))]
                               (assoc coll :children (set (map add-children children)))))]
    ;; call the `add-children` function we just built on the root `collection` that was passed in.
    (-> (add-children collection)
        ;; since this function will be used for hydration (etc.), return only the newly produced `:children`
        ;; key
        :children)))


(s/defn effective-children :- #{CollectionInstance}
  "Return the descendant Collections of a `collection` that should be presented to the current user as the children of
  this Collection. This takes into account descendants that get filtered out when the current user can't see them. For
  example, suppose we have some Collections with a hierarchy like this:

       +-> B
       |
    A -+-> C -+-> D -> E
              |
              +-> F -> G

   Suppose the current User can see A, B, E, F, and G, but not C, or D. The 'effective' children of A would be B, E,
   and F, and the current user would be presented with a hierarchy like:

       +-> B
       |
    A -+-> E
       |
       +-> F -> G

   You can think of this process as 'collapsing' the Collection hierarchy and removing nodes that aren't visible to
   the current User. This needs to be done so we can give a User a way to navigate to nodes that they are allowed to
   access, but that are children of Collections they cannot access; in the example above, E and F are such nodes."
   {:hydrate :effective_children}
  [collection :- CollectionWithLocation]
  ;; Hydrate `:children` if it's not already done
  (-> (for [child (if (contains? collection :children)
                    (:children collection)
                    (descendants collection))]
        ;; if we can read this `child` then we can go ahead and keep it as is. Discard its `children` and `location`
        (if (i/can-read? child)
          (dissoc child :children :location)
          ;; otherwise recursively call on each of the grandchildren. Make it a `vec` so flatten works on it
          (vec (effective-children child))))
      ;; since the results will be nested once for each recursive call, un-nest the results and convert back to a set
      flatten
      set))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Recursive Operations: Moving & Archiving                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn move-collection!
  "Move a Collection and all its descendant Collections from its current `location` to a `new-location`."
  [collection :- CollectionWithLocation, new-location :- LocationPath]
  (let [orig-children-location (children-location collection)
        new-children-location  (children-location (assoc collection :location new-location))]
    ;; first move this Collection
    (log/info (trs "Moving Collection {0} and its descendants from {1} to {2}"
                   (u/get-id collection) (:location collection) new-location))
    (db/transaction
      (db/update! Collection (u/get-id collection) :location new-location)
      ;; we need to update all the descendant collections as well...
      (db/execute!
       {:update Collection
        :set    {:location (hsql/call :replace :location orig-children-location new-children-location)}
        :where  [:like :location (str orig-children-location "%")]}))))

(s/defn ^:private collection->descendant-ids :- (s/maybe #{su/IntGreaterThanZero})
  [collection :- CollectionWithLocation, & additional-conditions]
  (apply db/select-ids Collection
         :location [:like (str (children-location collection) "%")]
         additional-conditions))

(s/defn ^:private archive-collection!
  "Archive a Collection and its descendant Collections and their Cards, Dashboards, and Pulses."
  [collection :- CollectionWithLocation]
  (let [affected-collection-ids (cons (u/get-id collection)
                                      (collection->descendant-ids collection, :archived false))]
    (db/transaction
      (db/update-where! Collection {:id       [:in affected-collection-ids]
                                    :archived false}
        :archived true)
      (doseq [model '[Card Dashboard]]
        (db/update-where! model {:collection_id [:in affected-collection-ids]
                                 :archived      false}
          :archived true))
      (db/delete! 'Pulse :collection_id [:in affected-collection-ids]))))

(s/defn ^:private unarchive-collection!
  "Unarchive a Collection and its descendant Collections and their Cards, Dashboards, and Pulses."
  [collection :- CollectionWithLocation]
  (let [affected-collection-ids (cons (u/get-id collection)
                                      (collection->descendant-ids collection, :archived true))]
    (db/transaction
      (db/update-where! Collection {:id       [:in affected-collection-ids]
                                    :archived true}
        :archived false)
      (doseq [model '[Card Dashboard]]
        (db/update-where! model {:collection_id [:in affected-collection-ids]
                                 :archived      true}
          :archived false)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Toucan IModel & Perms Method Impls                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- pre-insert [{collection-name :name, color :color, :as collection}]
  (assert-valid-location collection)
  (assert-valid-hex-color color)
  (assoc collection :slug (slugify collection-name)))

(s/defn ^:private field-will-change? :- s/Bool
  "True if a `field-kw` is present in the `collection-updates` map of changes being passed into `pre-update`, and if
  the value is acually different from the current value in the DB."
  [field-kw :- s/Keyword, collection-before-updates :- CollectionInstance, collection-updates :- su/Map]
  (boolean
   (and (contains? collection-updates field-kw)
        (not= (get collection-before-updates field-kw)
              (get collection-updates        field-kw)))))

(s/defn ^:private check-changes-allowed-for-personal-collection
  "If we're trying to UPDATE a Personal Collection, make sure the proposed changes are allowed. Personal Collections
  have lots of restrictions -- you can't archive them, for example, nor can you transfer them to other Users."
  [collection-before-updates :- CollectionWithLocation, collection-updates :- su/Map]
  ;; you're not allowed to change the `:personal_owner_id` of a Collection!
  ;; double-check and make sure it's not just the existing value getting passed back in for whatever reason
  (when (field-will-change? :personal_owner_id collection-before-updates collection-updates)
    (throw
     (ex-info (tru "You're not allowed to change the owner of a Personal Collection.")
       {:status-code 400
        :errors      {:personal_owner_id (tru "You're not allowed to change the owner of a Personal Collection.")}})))
  ;; You also definitely cannot *move* a Personal Collection
  (when (field-will-change? :location collection-before-updates collection-updates)
    (throw
     (ex-info (tru "You're not allowed to move a Personal Collection.")
       {:status-code 400
        :errors      {:location (tru "You're not allowed to move a Personal Collection.")}})))
  ;; You also can't archive a Personal Collection
  (when (field-will-change? :archived collection-before-updates collection-updates)
    (throw
     (ex-info (tru "You cannot archive a Personal Collection!")
       {:status-code 400
        :errors   {:archived (tru "You cannot archive a Personal Collection!")}}))))

(s/defn ^:private maybe-archive-or-unarchive!
  "If `:archived` specified in the updates map, archive/unarchive as needed."
  [collection-before-updates :- CollectionWithLocation, collection-updates :- su/Map]
  ;; If the updates map contains a value for `:archived`, see if it's actually something different than current value
  (when (field-will-change? :archived collection-before-updates collection-updates)
    ;; check to make sure we're not trying to change location at the same time
    (when (field-will-change? :location collection-before-updates collection-updates)
      (throw (ex-info (tru "You cannot move a Collection and archive it at the same time.")
               {:status-code 400
                :errors      {:archived (tru "You cannot move a Collection and archive it at the same time.")}})))
    ;; ok, go ahead and do the archive/unarchive operation
    ((if (:archived collection-updates)
       archive-collection!
       unarchive-collection!) collection-before-updates)))

(defn- pre-update [{collection-name :name, id :id, color :color, :as collection-updates}]
  (let [collection-before-updates (Collection id)]
    ;; VARIOUS CHECKS BEFORE DOING ANYTHING:
    ;; (1) if this is a personal Collection, check that the 'propsed' changes are allowed
    (when (:personal_owner_id collection-before-updates)
      (check-changes-allowed-for-personal-collection collection-before-updates collection-updates))
    ;; (2) make sure the location is valid if we're changing it
    (assert-valid-location collection-updates)
    ;; (3) make sure hex color is valid
    (when (field-will-change? :color collection-before-updates collection-updates)
      (assert-valid-hex-color color))
    ;; OK, AT THIS POINT THE CHANGES ARE VALIDATED. NOW START ISSUING UPDATES
    ;; (1) archive or unarchive as appropriate
    (maybe-archive-or-unarchive! collection-before-updates collection-updates)
    ;; (2) slugify the collection name in case it's changed in the output; the results of this will get passed along
    ;; to Toucan's `update!` impl
    (cond-> collection-updates
      collection-name (assoc :slug (slugify collection-name)))))

(def ^:dynamic *allow-deleting-personal-collections*
  "Whether to allow deleting Personal Collections. Normally we should *never* allow this, but in the single case of
  deleting a User themselves, we need to allow this. (Note that in normal usage, Users never get deleted, but rather
  archived; thus this code is used solely by our test suite, by things such as the `with-temp` macros.)"
  false)

(defn- pre-delete [collection]
  ;; unset the collection_id for Cards/Pulses in this collection. This is mostly for the sake of tests since IRL we
  ;; shouldn't be deleting Collections, but rather archiving them instead
  (doseq [model ['Card 'Pulse 'Dashboard]]
    (db/update-where! model {:collection_id (u/get-id collection)}
      :collection_id nil))
  ;; Now delete all the Children of this Collection
  (db/delete! Collection :location (children-location collection))
  ;; You can't delete a Personal Collection! Unless we enable it because we are simultaneously deleting the User
  (when-not *allow-deleting-personal-collections*
    (when (:personal_owner_id collection)
      (throw (Exception. (str (tru "You cannot delete a Personal Collection!")))))))

(defn perms-objects-set
  "Return the required set of permissions to `read-or-write` `collection-or-id`."
  [collection-or-id read-or-write]
  ;; This is not entirely accurate as you need to be a superuser to modifiy a collection itself (e.g., changing its
  ;; name) but if you have write perms you can add/remove cards
  #{(case read-or-write
      :read  (perms/collection-read-path collection-or-id)
      :write (perms/collection-readwrite-path collection-or-id))})


(u/strict-extend (class Collection)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:collection])
          :types          (constantly {:name :clob, :description :clob})
          :pre-insert     pre-insert
          :pre-update     pre-update
          :pre-delete     pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?         (partial i/current-user-has-full-permissions? :read)
          :can-write?        (partial i/current-user-has-full-permissions? :write)
          :perms-objects-set perms-objects-set}))


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
  "Return the permissions graph for a single group having PERMISSIONS-SET."
  [permissions-set collection-ids]
  (into
   {:root (perms-type-for-collection permissions-set root-collection)}
   (for [collection-id collection-ids]
     {collection-id (perms-type-for-collection permissions-set collection-id)})))

(s/defn graph :- PermissionsGraph
  "Fetch a graph representing the current permissions status for every group and all permissioned collections. This
  works just like the function of the same name in `metabase.models.permissions`; see also the documentation for that
  function."
  []
  (let [group-id->perms (group-id->permissions-set)
        collection-ids  (db/select-ids 'Collection, :personal_owner_id nil)] ; exclude personal collections!
    {:revision (collection-revision/latest-id)
     :groups   (into {} (for [group-id (db/select-ids 'PermissionsGroup)]
                          {group-id (group-permissions-graph (group-id->perms group-id) collection-ids)}))}))


;;; -------------------------------------------------- Update Graph --------------------------------------------------

(s/defn ^:private update-collection-permissions!
  [group-id             :- su/IntGreaterThanZero
   collection-id        :- (s/cond-pre (s/eq :root) su/IntGreaterThanZero)
   new-collection-perms :- CollectionPermissions]
  (let [collection-id (if (= collection-id :root)
                        root-collection
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Perms Checking Helper Fns                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn check-write-perms-for-collection
  "Check that we have write permissions for Collection with `collection-id`, or throw a 403 Exception. If
  `collection-id` is `nil`, this check is done for the Root Collection."
  [collection-or-id-or-nil]
  (api/check-403 (perms/set-has-full-permissions? @*current-user-permissions-set*
                   (perms/collection-readwrite-path (if collection-or-id-or-nil
                                                      collection-or-id-or-nil
                                                      root-collection)))))

(defn check-allowed-to-change-collection
  "If we're changing the `collection_id` of an object, make sure we have write permissions for both the old and new
  Collections, or throw a 403 if not. If `collection_id` isn't present in `object-updates`, or the value is the same
  as the original, this check is a no-op.

  As usual, an `collection-id` of `nil` represents the Root Collection.


  Intended for use with `PUT` or `PATCH`-style operations. Usage should look something like:

    ;; `object-before-update` is the object as it currently exists in the application DB
    ;; `object-updates` is a map of updated values for the object
    (check-allowed-to-change-collection (Card 100) http-request-body)"
  [object-before-update object-updates]
  ;; if collection_id is set to change...
  (when (contains? object-updates :collection_id)
    (when (not= (:collection_id object-updates)
                (:collection_id object-before-update))
      ;; check that we're allowed to modify the old Collection
      (check-write-perms-for-collection (:collection_id object-before-update))
      ;; check that we're allowed to modify the new Collection
      (check-write-perms-for-collection (:collection_id object-updates)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Personal Collections                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private user->personal-collection-name :- su/NonBlankString
  "Come up with a nice name for the Personal Collection for `user-or-id`."
  [user-or-id]
  ;; TODO - we currently enforce a unique constraint on Collection names... what are we going to do if two Users have
  ;; the same first & last name! This will *ruin* their lives :(
  (let [{first-name :first_name, last-name :last_name} (db/select-one ['User :first_name :last_name]
                                                         :id (u/get-id user-or-id))]
    (tru "{0} {1}''s Personal Collection" first-name last-name)))

(s/defn user->personal-collection :- CollectionInstance
  "Return the Personal Collection for `user-or-id`, if it already exists; if not, create it and return it."
  [user-or-id]
  (or (db/select-one Collection :personal_owner_id (u/get-id user-or-id))
      (try
        (db/insert! Collection
          :name              (user->personal-collection-name user-or-id)
          :personal_owner_id (u/get-id user-or-id)
          ;; a nice slate blue color
          :color             "#31698A")
        ;; if an Exception was thrown why trying to create the Personal Collection, we can assume it was a race
        ;; condition where some other thread created it in the meantime; try one last time to fetch it
        (catch Throwable _
          (db/select-one Collection :personal_owner_id (u/get-id user-or-id))))))

(defn include-personal-collection-ids
  "Efficiently hydrate the `:personal_collection_id` property of a sequence of Users. (This is, predictably, the ID of
  their Personal Collection.)"
  {:batched-hydrate :personal_collection_id}
  [users]
  (when (seq users)
    (let [user-id->collection-id (db/select-field->id :personal_owner_id Collection
                                   :personal_owner_id [:in (set (map u/get-id users))])]
      (for [user users]
        (assoc user :personal_collection_id (user-id->collection-id (u/get-id user)))))))
