(ns metabase.models.collection
  "Collections are used to organize Cards, Dashboards, and Pulses; as of v0.30, they are the primary way we determine
  permissions for these objects.
  `metabase.models.collection.graph`. `metabase.models.collection.graph`"
  (:refer-clojure :exclude [ancestors descendants])
  (:require [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.api.common :as api :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.models
             [interface :as i]
             [permissions :as perms :refer [Permissions]]]
            [metabase.models.collection.root :as collection.root]
            [metabase.util :as u]
            [metabase.util
             [i18n :as ui18n :refer [trs tru]]
             [schema :as su]]
            [potemkin :as p]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]])
  (:import metabase.models.collection.root.RootCollection))

(comment collection.root/keep-me)

(p/import-vars [collection.root root-collection])

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
  (boolean
   (and (string? s)
        (re-matches #"^/(\d+/)*$" s)
        (let [ids (unchecked-location-path->ids s)]
          (or (empty? ids)
              (apply distinct? ids))))))

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
      (let [msg (tru "Invalid Collection location: path is invalid.")]
        (throw (ex-info msg {:status-code 400, :errors {:location msg}}))))
    ;; if this is a Personal Collection it's only allowed to go in the Root Collection: you can't put it anywhere else!
    (when (contains? collection :personal_owner_id)
      (when-not (= location "/")
        (let [msg (tru "You cannot move a Personal Collection.")]
          (throw (ex-info msg {:status-code 400, :errors {:location msg}})))))
    ;; Also make sure that all the IDs referenced in the Location path actually correspond to real Collections
    (when-not (all-ids-in-location-path-are-valid? location)
      (let [msg (tru "Invalid Collection location: some or all ancestors do not exist.")]
        (throw (ex-info msg {:status-code 404, :errors {:location msg}}))))))

(defn- assert-valid-namespace
  "Check that the namespace of this Collection is valid -- it must belong to the same namespace as its parent
  Collection."
  [{:keys [location], owner-id :personal_owner_id, collection-namespace :namespace, :as collection}]
  {:pre [(contains? collection :namespace)]}
  (when location
    (when-let [parent-id (location-path->parent-id location)]
      (let [parent-namespace (db/select-one-field :namespace Collection :id parent-id)]
        (when-not (= (keyword collection-namespace) (keyword parent-namespace))
          (let [msg (tru "Collection must be in the same namespace as its parent")]
            (throw (ex-info msg {:status-code 400, :errors {:location msg}})))))))
  ;; non-default namespace Collections cannot be personal Collections
  (when (and owner-id collection-namespace)
    (let [msg (tru "Personal Collections must be in the default namespace")]
      (throw (ex-info msg {:status-code 400, :errors {:personal_owner_id msg}})))))

(defn root-collection-with-ui-details
  "The special Root Collection placeholder object with some extra details to facilitate displaying it on the FE."
  []
  (assoc root-collection
         :name (tru "Our analytics")
         :id   "root"))

(def ^:private CollectionWithLocationOrRoot
  (s/cond-pre
   RootCollection
   {:location LocationPath
    s/Keyword s/Any}))

(def CollectionWithLocationAndIDOrRoot
  "Schema for a valid `CollectionInstance` that has valid `:location` and `:id` properties, or the special
  `root-collection` placeholder object."
  (s/cond-pre
   RootCollection
   {:location LocationPath
    :id       su/IntGreaterThanZero
    s/Keyword s/Any}))

(s/defn ^:private parent :- CollectionWithLocationAndIDOrRoot
  "Fetch the parent Collection of `collection`, or the Root Collection special placeholder object if this is a
  top-level Collection."
  [collection :- CollectionWithLocationOrRoot]
  (if-let [new-parent-id (location-path->parent-id (:location collection))]
    (Collection new-parent-id)
    root-collection))

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
  "Includes the possible values for visible collections, either `:all` or a set of ids, possibly including `\"root\"` to
  represent the root collection."
  (s/cond-pre (s/eq :all) #{(s/cond-pre (s/eq "root") su/IntGreaterThanZero)}))

(s/defn permissions-set->visible-collection-ids :- VisibleCollections
  "Given a `permissions-set` (presumably those of the current user), return a set of IDs of Collections that the
  permissions set allows you to view. For those with *root* permissions (e.g., an admin), this function will return
  `:all`, signifying that you are allowed to view all Collections. For *Root Collection* permissions, the response
  will include \"root\".

    (permissions-set->visible-collection-ids #{\"/collection/10/\"})   ; -> #{10}
    (permissions-set->visible-collection-ids #{\"/\"})                 ; -> :all
    (permissions-set->visible-collection-ids #{\"/collection/root/\"}) ; -> #{\"root\"}

  You probably don't want to consume the results of this function directly -- most of the time, the reason you are
  calling this function in the first place is because you want add a `FILTER` clause to an application DB query (e.g.
  to only fetch Cards that belong to Collections visible to the current User). Use
  `visible-collection-ids->honeysql-filter-clause` to generate a filter clause that handles all possible outputs of
  this function correctly.

  !!! IMPORTANT NOTE !!!

  Because the result may include `nil` for the Root Collection, or may be `:all`, MAKE SURE YOU HANDLE THOSE
  SITUATIONS CORRECTLY before using these IDs to make a DB call. Better yet, use
  `collection-ids->honeysql-filter-clause` to generate appropriate HoneySQL."
  [permissions-set :- #{perms/UserPath}]
  (if (contains? permissions-set "/")
    :all
    (set
     (for [path  permissions-set
           :let  [[_ id-str] (re-matches #"/collection/((?:\d+)|root)/(read/)?" path)]
           :when id-str]
       (cond-> id-str
         (not= id-str "root") Integer/parseInt)))))


(s/defn visible-collection-ids->honeysql-filter-clause
  "Generate an appropriate HoneySQL `:where` clause to filter something by visible Collection IDs, such as the ones
  returned by `permissions-set->visible-collection-ids`. Correctly handles all possible values returned by that
  function, including `:all` and `nil` Collection IDs (for the Root Collection).

  Guaranteed to always generate a valid HoneySQL form, so this can be used directly in a query without further checks.

    (db/select Card
      {:where (collection/visible-collection-ids->honeysql-filter-clause
               (collection/permissions-set->visible-collection-ids
                @*current-user-permissions-set*))})"
  ([collection-ids :- VisibleCollections]
   (visible-collection-ids->honeysql-filter-clause :collection_id collection-ids))

  ([collection-id-field :- s/Keyword, collection-ids :- VisibleCollections]
   (if (= collection-ids :all)
     true
     (let [{non-root-ids false, root-id true} (group-by (partial = "root") collection-ids)
           non-root-clause                    (when (seq non-root-ids)
                                                [:in collection-id-field non-root-ids])
           root-clause                        (when (seq root-id)
                                                [:= collection-id-field nil])]
       (cond
         (and root-clause non-root-clause)
         [:or root-clause non-root-clause]

         (or root-clause non-root-clause)
         (or root-clause non-root-clause)

         :else
         false)))))


(s/defn effective-location-path :- (s/maybe LocationPath)
  "Given a `location-path` and a set of Collection IDs one is allowed to view (obtained from
  `permissions-set->visible-collection-ids` above), calculate the 'effective' location path (excluding IDs of
  Collections for which we do not have read perms) we should show to the User.

  When called with a single argument, `collection`, this is used as a hydration function to hydrate
  `:effective_location`."
  {:hydrate :effective_location}
  ([collection :- CollectionWithLocationOrRoot]
   (if (collection.root/is-root-collection? collection)
     nil
     (effective-location-path (:location collection)
                              (permissions-set->visible-collection-ids @*current-user-permissions-set*))))

  ([real-location-path :- LocationPath, allowed-collection-ids :- VisibleCollections]
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

(s/defn effective-ancestors :- [(s/cond-pre RootCollection CollectionInstance)]
  "Fetch the ancestors of a `collection`, filtering out any ones the current User isn't allowed to see. This is used
  in the UI to power the 'breadcrumb' path to the location of a given Collection. For example, suppose we have four
  Collections, nested like:

    A > B > C > D

  The ancestors of D are:

    [Root] > A > B > C

  If the current User is allowed to see A and C, but not B, `effective-ancestors` of D will be:

    [Root] > A > C

  Thus the existence of C will be kept hidden from the current User, and for all intents and purposes the current User
  can effectively treat A as the parent of C."
  {:hydrate :effective_ancestors}
  [collection :- CollectionWithLocationAndIDOrRoot]
  (if (collection.root/is-root-collection? collection)
    []
    (filter i/can-read? (cons (root-collection-with-ui-details) (ancestors collection)))))

(s/defn parent-id :- (s/maybe su/IntGreaterThanZero)
  "Get the immediate parent `collection` id, if set."
  {:hydrate :parent_id}
  [{:keys [location]} :- CollectionWithLocationOrRoot]
  (if location (location-path->parent-id location)))

(s/defn children-location :- LocationPath
  "Given a `collection` return a location path that should match the `:location` value of all the children of the
  Collection.

     (children-location collection) ; -> \"/10/20/30/;

     ;; To get children of this collection:
     (db/select Collection :location \"/10/20/30/\")"
  [{:keys [location], :as collection} :- CollectionWithLocationAndIDOrRoot]
  (if (collection.root/is-root-collection? collection)
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
  [collection :- CollectionWithLocationAndIDOrRoot, & additional-honeysql-where-clauses]
  ;; first, fetch all the descendants of the `collection`, and build a map of location -> children. This will be used
  ;; so we can fetch the immediate children of each Collection
  (let [location->children (group-by :location (db/select [Collection :name :id :location :description]
                                                 {:where
                                                  (apply
                                                   vector
                                                   :and
                                                   [:like :location (str (children-location collection) "%")]
                                                   ;; Only return the Personal Collection belonging to the Current
                                                   ;; User, regardless of whether we should actually be allowed to see
                                                   ;; it (e.g., admins have perms for all Collections). This is done
                                                   ;; to keep the Root Collection View for admins from getting crazily
                                                   ;; cluttered with Personal Collections belonging to randos
                                                   [:or
                                                    [:= :personal_owner_id nil]
                                                    [:= :personal_owner_id *current-user-id*]]
                                                   additional-honeysql-where-clauses)}))
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

(s/defn ^:private descendant-ids :- (s/maybe #{su/IntGreaterThanZero})
  "Return a set of IDs of all descendant Collections of a `collection`."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (db/select-ids Collection :location [:like (str (children-location collection) \%)]))

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
  [collection :- CollectionWithLocationAndIDOrRoot, & additional-honeysql-where-clauses]
  ;; Hydrate `:children` if it's not already done
  (-> (for [child (if (contains? collection :children)
                    (:children collection)
                    (apply descendants collection additional-honeysql-where-clauses))]
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

(s/defn perms-for-archiving :- #{perms/ObjectPath}
  "Return the set of Permissions needed to archive or unarchive a `collection`. Since archiving a Collection is
  *recursive* (i.e., it applies to all the descendant Collections of that Collection), we require write ('curate')
  permissions for the Collection itself and all its descendants, but not for its parent Collection.

  For example, suppose we have a Collection hierarchy like:

    A > B > C

  To move or archive B, you need write permissions for A, B, and C:

  *  A, because you are taking something out of it (by archiving it)
  *  B, because you are archiving it
  *  C, because by archiving its parent, you are archiving it as well"
  [collection :- CollectionWithLocationAndIDOrRoot]
  ;; Make sure we're not trying to archive the Root Collection...
  (when (collection.root/is-root-collection? collection)
    (throw (Exception. (tru "You cannot archive the Root Collection."))))
  ;; also make sure we're not trying to archive a PERSONAL Collection
  (when (db/exists? Collection :id (u/get-id collection), :personal_owner_id [:not= nil])
    (throw (Exception. (tru "You cannot archive a Personal Collection."))))
  (set
   (for [collection-or-id (cons
                           (parent collection)
                           (cons
                            collection
                            (db/select-ids Collection :location [:like (str (children-location collection) "%")])))]
     (perms/collection-readwrite-path collection-or-id))))

(s/defn perms-for-moving :- #{perms/ObjectPath}
  "Return the set of Permissions needed to move a `collection`. Like archiving, moving is recursive, so we require
  perms for both the Collection and its descendants; we additionally require permissions for its new parent Collection.


  For example, suppose we have a Collection hierarchy of three Collections, A, B, and C, and a forth Collection, D,
  and we want to move B from A to D:

    A > B > C        A
               ===>
    D                D > B > C

  To move or archive B, you would need write permissions for A, B, C, and D:

  *  A, because we're moving something out of it
  *  B, since it's the Collection we're operating on
  *  C, since it will by definition be affected too
  *  D, because it's the new parent Collection, and moving something into it requires write perms."
  [collection :- CollectionWithLocationAndIDOrRoot, new-parent :- CollectionWithLocationAndIDOrRoot]
  ;; Make sure we're not trying to move the Root Collection...
  (when (collection.root/is-root-collection? collection)
    (throw (Exception. (tru "You cannot move the Root Collection."))))
  ;; Needless to say, it makes no sense to move a Collection into itself or into one of its descendants. So let's make
  ;; sure we're not doing that...
  (when (contains? (set (location-path->ids (children-location new-parent)))
                   (u/get-id collection))
    (throw (Exception. (tru "You cannot move a Collection into itself or into one of its descendants."))))
  (set
   (cons (perms/collection-readwrite-path new-parent)
         (perms-for-archiving collection))))

(s/defn move-collection!
  "Move a Collection and all its descendant Collections from its current `location` to a `new-location`."
  [collection :- CollectionWithLocationAndIDOrRoot, new-location :- LocationPath]
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
  [collection :- CollectionWithLocationAndIDOrRoot, & additional-conditions]
  (apply db/select-ids Collection
         :location [:like (str (children-location collection) "%")]
         additional-conditions))

(s/defn ^:private archive-collection!
  "Archive a Collection and its descendant Collections and their Cards, Dashboards, and Pulses."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (let [affected-collection-ids (cons (u/get-id collection)
                                      (collection->descendant-ids collection, :archived false))]
    (db/transaction
      (db/update-where! Collection {:id       [:in affected-collection-ids]
                                    :archived false}
        :archived true)
      (doseq [model '[Card Dashboard NativeQuerySnippet Pulse]]
        (db/update-where! model {:collection_id [:in affected-collection-ids]
                                 :archived      false}
          :archived true)))))

(s/defn ^:private unarchive-collection!
  "Unarchive a Collection and its descendant Collections and their Cards, Dashboards, and Pulses."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (let [affected-collection-ids (cons (u/get-id collection)
                                      (collection->descendant-ids collection, :archived true))]
    (db/transaction
      (db/update-where! Collection {:id       [:in affected-collection-ids]
                                    :archived true}
        :archived false)
      (doseq [model '[Card Dashboard NativeQuerySnippet Pulse]]
        (db/update-where! model {:collection_id [:in affected-collection-ids]
                                 :archived      true}
          :archived false)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Toucan IModel & Perms Method Impls                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private CollectionWithLocationAndPersonalOwnerID
  "Schema for a Collection instance that has a valid `:location`, and a `:personal_owner_id` key *present* (but not
  neccesarily non-nil)."
  {:location          LocationPath
   :personal_owner_id (s/maybe su/IntGreaterThanZero)
   s/Keyword          s/Any})

(s/defn ^:private is-personal-collection-or-descendant-of-one? :- s/Bool
  "Is `collection` a Personal Collection, or a descendant of one?"
  [collection :- CollectionWithLocationAndPersonalOwnerID]
  (boolean
   (or
    ;; If collection has an owner ID we're already done here, we know it's a Personal Collection
    (:personal_owner_id collection)
    ;; Otherwise try to get the ID of its highest-level ancestor, e.g. if `location` is `/1/2/3/` we would get `1`.
    ;; Then see if the root-level ancestor is a Personal Collection (Personal Collections can only got in the Root
    ;; Collection.)
    (db/exists? Collection
      :id                (first (location-path->ids (:location collection)))
      :personal_owner_id [:not= nil]))))


;;; ----------------------------------------------------- INSERT -----------------------------------------------------

(defn- pre-insert [{collection-name :name, color :color, :as collection}]
  (assert-valid-location collection)
  (assert-valid-namespace (merge {:namespace nil} collection))
  (assert-valid-hex-color color)
  (assoc collection :slug (slugify collection-name)))

(defn- copy-collection-permissions!
  "Grant read permissions to destination Collections for every Group with read permissions for a source Collection,
  and write perms for every Group with write perms for the source Collection."
  [source-collection-or-id dest-collections-or-ids]
  ;; figure out who has permissions for the source Collection...
  (let [group-ids-with-read-perms  (db/select-field :group_id Permissions
                                     :object (perms/collection-read-path source-collection-or-id))
        group-ids-with-write-perms (db/select-field :group_id Permissions
                                     :object (perms/collection-readwrite-path source-collection-or-id))]
    ;; ...and insert corresponding rows for each destination Collection
    (db/insert-many! Permissions
      (concat
       ;; insert all the new read-perms records
       (for [dest     dest-collections-or-ids
             :let     [read-path (perms/collection-read-path dest)]
             group-id group-ids-with-read-perms]
         {:group_id group-id, :object read-path})
       ;; ...and all the new write-perms records
       (for [dest     dest-collections-or-ids
             :let     [readwrite-path (perms/collection-readwrite-path dest)]
             group-id group-ids-with-write-perms]
         {:group_id group-id, :object readwrite-path})))))

(defn- copy-parent-permissions!
  "When creating a new Collection, we shall copy the Permissions entries for its parent. That way, Groups who can see
  its parent can see it; and Groups who can 'curate' (write) its parent can 'curate' it, as a default state. (Of
  course, admins can change these permissions after the fact.)

  This does *not* apply to Collections that are created inside a Personal Collection or one of its descendants.
  Descendants of Personal Collections, like Personal Collections themselves, cannot have permissions entries in the
  application database.

  For newly created Collections at the root-level, copy the existing permissions for the Root Collection."
  [{:keys [location id], :as collection}]
  (when-not (is-personal-collection-or-descendant-of-one? collection)
    (let [parent-collection-id (location-path->parent-id location)]
      (copy-collection-permissions! (or parent-collection-id root-collection) [id]))))

(defn- post-insert [collection]
  (u/prog1 collection
    (copy-parent-permissions! collection)))


;;; ----------------------------------------------------- UPDATE -----------------------------------------------------

(s/defn ^:private check-changes-allowed-for-personal-collection
  "If we're trying to UPDATE a Personal Collection, make sure the proposed changes are allowed. Personal Collections
  have lots of restrictions -- you can't archive them, for example, nor can you transfer them to other Users."
  [collection-before-updates :- CollectionWithLocationAndIDOrRoot, collection-updates :- su/Map]
  ;; you're not allowed to change the `:personal_owner_id` of a Collection!
  ;; double-check and make sure it's not just the existing value getting passed back in for whatever reason
  (when (api/column-will-change? :personal_owner_id collection-before-updates collection-updates)
    (throw
     (ex-info (tru "You're not allowed to change the owner of a Personal Collection.")
       {:status-code 400
        :errors      {:personal_owner_id (tru "You're not allowed to change the owner of a Personal Collection.")}})))
  ;;
  ;; The checks below should be redundant because the `perms-for-moving` and `perms-for-archiving` functions also
  ;; check to make sure you're not operating on Personal Collections. But as an extra safety net it doesn't hurt to
  ;; check here too.
  ;;
  ;; You also definitely cannot *move* a Personal Collection
  (when (api/column-will-change? :location collection-before-updates collection-updates)
    (throw
     (ex-info (tru "You're not allowed to move a Personal Collection.")
       {:status-code 400
        :errors      {:location (tru "You're not allowed to move a Personal Collection.")}})))
  ;; You also can't archive a Personal Collection
  (when (api/column-will-change? :archived collection-before-updates collection-updates)
    (throw
     (ex-info (tru "You cannot archive a Personal Collection.")
       {:status-code 400
        :errors      {:archived (tru "You cannot archive a Personal Collection.")}}))))

(s/defn ^:private maybe-archive-or-unarchive!
  "If `:archived` specified in the updates map, archive/unarchive as needed."
  [collection-before-updates :- CollectionWithLocationAndIDOrRoot, collection-updates :- su/Map]
  ;; If the updates map contains a value for `:archived`, see if it's actually something different than current value
  (when (api/column-will-change? :archived collection-before-updates collection-updates)
    ;; check to make sure we're not trying to change location at the same time
    (when (api/column-will-change? :location collection-before-updates collection-updates)
      (throw (ex-info (tru "You cannot move a Collection and archive it at the same time.")
               {:status-code 400
                :errors      {:archived (tru "You cannot move a Collection and archive it at the same time.")}})))
    ;; ok, go ahead and do the archive/unarchive operation
    ((if (:archived collection-updates)
       archive-collection!
       unarchive-collection!) collection-before-updates)))

;; MOVING COLLECTIONS ACROSS "PERSONAL" BOUNDARIES
;;
;; As mentioned elsewhere, Permissions for Collections are handled in two different, incompatible, ways, depending on
;; whether or not the Collection is a descendant of a Personal Collection:
;;
;; *  Personal Collections, and their descendants, DO NOT have Permissions for different Groups recorded in the
;;    application Database. Perms are bound dynamically, so that the Current User has read/write perms for their
;;    Personal Collection, and for any of its descendant Collections. These CANNOT be edited.
;;
;; *  Collections that are NOT descendants of Personal Collections are assigned permissions on a Group-by-Group basis
;;    using Permissions entries from the application DB, and edited via the permissions graph.
;;
;; Thus, When a Collection moves "across the boundary" and either becomes a descendant of a Personal Collection, or
;; ceases to be one, we need to take steps to transition it so it plays nicely with the new way Permissions will apply
;; to it. The steps taken in each direction are explained in more detail for in the docstrings of their respective
;; implementing functions below.

(s/defn ^:private grant-perms-when-moving-out-of-personal-collection!
  "When moving a descendant of a Personal Collection into the Root Collection, or some other Collection not descended
  from a Personal Collection, we need to grant it Permissions, since now that it has moved across the boundary into
  impersonal-land it *requires* Permissions to be seen or 'curated'. If we did not grant Permissions when moving, it
  would immediately become invisible to all save admins, because no Group would have perms for it. This is obviously a
  bad experience -- we do not want a User to move a Collection that they have read/write perms for (by definition) to
  somewhere else and lose all access for it."
  [collection :- CollectionInstance, new-location :- LocationPath]
  (copy-collection-permissions! (parent {:location new-location}) (cons collection (descendants collection))))

(s/defn ^:private revoke-perms-when-moving-into-personal-collection!
  "When moving a `collection` that is *not* a descendant of a Personal Collection into a Personal Collection or one of
  its descendants (moving across the boundary in the other direction), any previous Group Permissions entries for it
  need to be deleted, so other users cannot access this newly-Personal Collection.

  This needs to be done recursively for all descendants as well."
  [collection :- CollectionInstance]
  (db/execute! {:delete-from Permissions
                :where       [:in :object (for [collection (cons collection (descendants collection))
                                                path-fn    [perms/collection-read-path
                                                            perms/collection-readwrite-path]]
                                            (path-fn collection))]}))

(defn- update-perms-when-moving-across-personal-boundry!
  "If a Collection is moving 'across the boundry' and will become a descendant of a Personal Collection, or will cease
  to be one, adjust the Permissions for it accordingly."
  [collection-before-updates collection-updates]
  ;; first, figure out if the collection is a descendant of a Personal Collection now, and whether it will be after
  ;; the update
  (let [is-descendant-of-personal?      (is-personal-collection-or-descendant-of-one? collection-before-updates)
        will-be-descendant-of-personal? (is-personal-collection-or-descendant-of-one? (merge collection-before-updates
                                                                                             collection-updates))]
    ;; see if whether it is a descendant of a Personal Collection or not is set to change. If it's not going to
    ;; change, we don't need to do anything
    (when (not= is-descendant-of-personal? will-be-descendant-of-personal?)
      ;; if it *is* a descendant of a Personal Collection, and is about to be moved into the 'real world', we need to
      ;; copy the new parent's perms for it and for all of its descendants
      (if is-descendant-of-personal?
        (grant-perms-when-moving-out-of-personal-collection! collection-before-updates (:location collection-updates))
        ;; otherwise, if it is *not* a descendant of a Personal Collection, but is set to become one, we need to
        ;; delete any perms entries for it and for all of its descendants, so other randos won't be able to access
        ;; this newly privatized Collection
        (revoke-perms-when-moving-into-personal-collection! collection-before-updates)))))


;; PUTTING IT ALL TOGETHER <3

(defn- pre-update [{collection-name :name, id :id, color :color, :as collection-updates}]
  (let [collection-before-updates (Collection id)]
    ;; VARIOUS CHECKS BEFORE DOING ANYTHING:
    ;; (1) if this is a personal Collection, check that the 'propsed' changes are allowed
    (when (:personal_owner_id collection-before-updates)
      (check-changes-allowed-for-personal-collection collection-before-updates collection-updates))
    ;; (2) make sure the location is valid if we're changing it
    (assert-valid-location collection-updates)
    ;; (3) make sure Collection namespace is valid
    (when (contains? collection-updates :namespace)
      (when (not= (:namespace collection-before-updates) (:namespace collection-updates))
        (let [msg (tru "You cannot move a Collection to a different namespace once it has been created.")]
          (throw (ex-info msg {:status-code 400, :errors {:namespace msg}})))))
    (assert-valid-namespace (merge (select-keys collection-before-updates [:namespace]) collection-updates))
    ;; (4) If we're moving a Collection from a location on a Personal Collection hierarchy to a location not on one,
    ;; or vice versa, we need to grant/revoke permissions as appropriate (see above for more details)
    (when (api/column-will-change? :location collection-before-updates collection-updates)
      (update-perms-when-moving-across-personal-boundry! collection-before-updates collection-updates))
    ;; (5) make sure hex color is valid
    (when (api/column-will-change? :color collection-before-updates collection-updates)
      (assert-valid-hex-color color))
    ;; OK, AT THIS POINT THE CHANGES ARE VALIDATED. NOW START ISSUING UPDATES
    ;; (1) archive or unarchive as appropriate
    (maybe-archive-or-unarchive! collection-before-updates collection-updates)
    ;; (2) slugify the collection name in case it's changed in the output; the results of this will get passed along
    ;; to Toucan's `update!` impl
    (cond-> collection-updates
      collection-name (assoc :slug (slugify collection-name)))))


;;; ----------------------------------------------------- DELETE -----------------------------------------------------

(defonce ^:dynamic ^{:doc "Whether to allow deleting Personal Collections. Normally we should *never* allow this, but
  in the single case of deleting a User themselves, we need to allow this. (Note that in normal usage, Users never get
  deleted, but rather archived; thus this code is used solely by our test suite, by things such as the `with-temp`
  macros.)"}
  *allow-deleting-personal-collections*
  false)

(defn- pre-delete [collection]
  ;; Delete all the Children of this Collection
  (db/delete! Collection :location (children-location collection))
  ;; You can't delete a Personal Collection! Unless we enable it because we are simultaneously deleting the User
  (when-not *allow-deleting-personal-collections*
    (when (:personal_owner_id collection)
      (throw (Exception. (tru "You cannot delete a Personal Collection!")))))
  ;; Delete permissions records for this Collection
  (db/execute! {:delete-from Permissions
                :where       [:or
                              [:= :object (perms/collection-readwrite-path collection)]
                              [:= :object (perms/collection-read-path collection)]]}))


;;; -------------------------------------------------- IModel Impl ---------------------------------------------------

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
          :types          (constantly {:namespace :keyword})
          :pre-insert     pre-insert
          :post-insert    post-insert
          :pre-update     pre-update
          :pre-delete     pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?         (partial i/current-user-has-full-permissions? :read)
          :can-write?        (partial i/current-user-has-full-permissions? :write)
          :perms-objects-set perms-objects-set}))


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
  (when (api/column-will-change? :collection_id object-before-update object-updates)
    ;; check that we're allowed to modify the old Collection
    (check-write-perms-for-collection (:collection_id object-before-update))
    ;; check that we're allowed to modify the new Collection
    (check-write-perms-for-collection (:collection_id object-updates))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Personal Collections                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn format-personal-collection-name
  "Constructs the personal collection name from user name."
  [first-name last-name]
  (tru "{0} {1}''s Personal Collection" first-name last-name))

(s/defn ^:private user->personal-collection-name :- su/NonBlankString
  "Come up with a nice name for the Personal Collection for `user-or-id`."
  [user-or-id]
  ;; TODO - we currently enforce a unique constraint on Collection names... what are we going to do if two Users have
  ;; the same first & last name! This will *ruin* their lives :(
  (let [{first-name :first_name, last-name :last_name} (db/select-one ['User :first_name :last_name]
                                                         :id (u/get-id user-or-id))]
    (format-personal-collection-name first-name last-name)))

(s/defn user->existing-personal-collection :- (s/maybe CollectionInstance)
  [user-or-id]
  (db/select-one Collection :personal_owner_id (u/get-id user-or-id)))

(s/defn user->personal-collection :- CollectionInstance
  "Return the Personal Collection for `user-or-id`, if it already exists; if not, create it and return it."
  [user-or-id]
  (or (user->existing-personal-collection user-or-id)
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

(def ^:private ^{:arglists '([user-id])} user->personal-collection-id
  "Cached function to fetch the ID of the Personal Collection belonging to User with `user-id`. Since a Personal
  Collection cannot be deleted, the ID will not change; thus it is safe to cache, saving a DB call. It is also
  required to caclulate the Current User's permissions set, which is done for every API call; thus it is cached to
  save a DB call for *every* API call."
  (memoize/ttl
   (s/fn user->personal-collection-id* :- su/IntGreaterThanZero
     [user-id :- su/IntGreaterThanZero]
     (u/get-id (user->personal-collection user-id)))
   ;; cache the results for 60 minutes; TTL is here only to eventually clear out old entries/keep it from growing too
   ;; large
   :ttl/threshold (* 60 60 1000)))

(s/defn user->personal-collection-and-descendant-ids
  "Somewhat-optimized function that fetches the ID of a User's Personal Collection as well as the IDs of all descendants
  of that Collection. Exists because this needs to be known to calculate the Current User's permissions set, which is
  done for every API call; this function is an attempt to make fetching this information as efficient as reasonably
  possible."
  [user-or-id]
  (let [personal-collection-id (user->personal-collection-id (u/get-id user-or-id))]
    (cons personal-collection-id
          ;; `descendant-ids` wants a CollectionWithLocationAndID, and luckily we know Personal Collections always go
          ;; in Root, so we can pass it what it needs without actually having to fetch an entire CollectionInstance
          (descendant-ids {:location "/", :id personal-collection-id}))))

(defn include-personal-collection-ids
  "Efficiently hydrate the `:personal_collection_id` property of a sequence of Users. (This is, predictably, the ID of
  their Personal Collection.)"
  {:batched-hydrate :personal_collection_id}
  [users]
  (when (seq users)
    ;; efficiently create a map of user ID -> personal collection ID
    (let [user-id->collection-id (db/select-field->id :personal_owner_id Collection
                                   :personal_owner_id [:in (set (map u/get-id users))])]
      ;; now for each User, try to find the corresponding ID out of that map. If it's not present (the personal
      ;; Collection hasn't been created yet), then instead call `user->personal-collection-id`, which will create it
      ;; as a side-effect. This will ensure this property never comes back as `nil`
      (for [user users]
        (assoc user :personal_collection_id (or (user-id->collection-id (u/get-id user))
                                                (user->personal-collection-id (u/get-id user))))))))

(defmulti allowed-namespaces
  "Set of Collection namespaces instances of this model are allowed to go in. By default, only the default
  namespace (namespace = `nil`)."
  {:arglists '([model])}
  class)

(defmethod allowed-namespaces :default
  [_]
  #{nil})

(defn check-collection-namespace
  "Check that object's `:collection_id` refers to a Collection in an allowed namespace (see
  `allowed-namespaces`), or throw an Exception.

    ;; Cards can only go in Collections in the default namespace (namespace = nil)
    (check-collection-namespace Card new-collection-id)"
  [model collection-id]
  (when collection-id
    (let [collection           (or (db/select-one [Collection :namespace] :id collection-id)
                                   (let [msg (tru "Collection does not exist.")]
                                     (throw (ex-info msg {:status-code 404
                                                          :errors      {:collection_id msg}}))))
          collection-namespace (keyword (:namespace collection))
          allowed-namespaces   (allowed-namespaces model)]
      (when-not (contains? allowed-namespaces collection-namespace)
        (let [msg (tru "A {0} can only go in Collections in the {1} namespace."
                       (name model)
                       (str/join (format " %s " (tru "or")) (map #(pr-str (or % (tru "default")))
                                                                 allowed-namespaces)))]
          (throw (ex-info msg {:status-code          400
                               :errors               {:collection_id msg}
                               :allowed-namespaces   allowed-namespaces
                               :collection-namespace collection-namespace})))))))
