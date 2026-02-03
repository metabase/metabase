(ns metabase.collections.models.collection
  "Collections are used to organize Cards, Dashboards, and Pulses; as of v0.30, they are the primary way we determine
  permissions for these objects."
  (:refer-clojure :exclude [ancestors descendants])
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common
    :as api
    :refer [*current-user-id*]]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.config.core :as config :refer [*request-id*]]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   ;; Trying to use metabase.search would cause a circular reference ;_;
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs tru deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]
   [toucan2.protocols :as t2.protocols]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(comment collection.root/keep-me)

(p/import-vars [collection.root root-collection root-collection-with-ui-details])

(def ^:private RootCollection
  "Schema for things that are instances of [[metabase.collections.models.collection.root.RootCollection]]."
  [:fn
   {:error/message "an instance of the root Collection"}
   #'collection.root/is-root-collection?])

(defn- archived-directly-models
  []
  #{:model/Card :model/Dashboard :model/Document})

(defn- collectable-models
  []
  (set/union (archived-directly-models)
             #{:model/Pulse :model/NativeQuerySnippet :model/Timeline}))

(def ^:private ^:const collection-slug-max-length
  "Maximum number of characters allowed in a Collection `slug`."
  510)

(def ^:constant trash-collection-type
  "The value of the `:type` field for the Trash collection that holds archived items."
  "trash")

(def ^:constant library-collection-type
  "The value of the `:type` field for library collections."
  "library")

(def ^:constant library-data-collection-type
  "The value of the `:type` field for collections that only allow tables."
  "library-data")

(def ^:constant library-metrics-collection-type
  "The value of the `:type` field for collections that only allow metrics."
  "library-metrics")

(def transforms-ns
  "Namespace for transforms"
  :transforms)

(def snippets-ns
  "Namespace for snippets"
  :snippets)

(defn- trash-collection* []
  (t2/select-one :model/Collection :type trash-collection-type))

(let [get-trash (mdb/memoize-for-application-db
                 (fn []
                   (u/prog1 (trash-collection*)
                     (when-not <>
                       (throw (ex-info "Fatal error: Trash collection is missing" {}))))))]
  (defn trash-collection
    "Get the (memoized) trash collection"
    []
    (assoc (get-trash) :name (deferred-tru "Trash"))))

(def shared-tenant-ns
  "Namespace for shared tenant collections"
  :shared-tenant-collection)

(mu/defn shared-tenant-collection?
  "Whether or not a collection is a tenant collection."
  [{:keys [namespace]} :- [:or RootCollection [:map [:namespace {:optional true} [:maybe [:or :keyword :string]]]]]]
  (= (some-> namespace name)
     (name shared-tenant-ns)))

(defn trash-collection-id
  "The ID representing the Trash collection."
  [] (u/the-id (trash-collection)))

(defn trash-path
  "The fixed location path for the trash collection."
  []
  (format "/%s/" (trash-collection-id)))

(defn is-trash?
  "Is this the trash collection?"
  [collection-or-id]
  ;; in some circumstances we don't have a `:type` on the collection (e.g. search or collection items lists, where we
  ;; select a subset of columns). Use the type if it's there, but fall back to the ID to be sure.
  ;; We can't *only* use the id because getting that requires selecting a collection :sweat-smile:
  (let [type (:type collection-or-id ::not-found)]
    (if (identical? type ::not-found)
      (some-> collection-or-id u/id (= (trash-collection-id)))
      (= type trash-collection-type))))

(defn is-trash-or-descendant?
  "Is this the trash collection, or a descendant of it?"
  [collection]
  (or (is-trash? collection)
      (and (:location collection)
           (str/starts-with? (:location collection) (trash-path)))))

(defn remote-synced-collection?
  "Is this a remote-synced collection?
   Returns true if the collection has is_remote_synced=true in the database."
  [collection-or-id]
  (cond
    (nil? collection-or-id) false ;; the root collection is never remote-synced
    (map? collection-or-id) (boolean (get collection-or-id :is_remote_synced))
    :else (t2/select-one-fn :is_remote_synced :model/Collection :id (u/the-id collection-or-id))))

(defn- is-library?
  "Is this the Library collection?"
  [collection]
  (= (:type collection) library-collection-type))

(defn- is-library-data-collection?
  "Is this the Data collection?"
  [collection]
  (= (:type collection) library-data-collection-type))

(defn- is-library-metrics-collection?
  "Is this the Metrics collection?"
  [collection]
  (= (:type collection) library-metrics-collection-type))

(defn remote-synced-collection
  "Get the remote-synced collection if it exists."
  []
  (t2/select-one :model/Collection :is_remote_synced true :location "/"))

(defonce ^:dynamic ^:private *clearing-remote-sync* false)

(defn clear-remote-synced-collection!
  "Marks any remote-synced-collection as non-remote-synced"
  []
  (binding [*clearing-remote-sync* true]
    (t2/update! :model/Collection :is_remote_synced true {:is_remote_synced false})))

(defn library-collection
  "Get the 'library' collection, if it exists."
  []
  (t2/select-one :model/Collection :type library-collection-type))

(defn create-library-collection!
  "Create the Library collection. Returns Created collection. Throws if it already exists."
  []
  (when-not (nil? (library-collection))
    (throw (ex-info "Library already exists" {})))
  (let [library       (t2/insert-returning-instance! :model/Collection {:name     "Library"
                                                                        :type     library-collection-type
                                                                        :location "/"})
        base-location (str "/" (:id library) "/")
        data          (t2/insert-returning-instance! :model/Collection {:name     "Data"
                                                                        :type     library-data-collection-type
                                                                        :location base-location})
        metrics       (t2/insert-returning-instance! :model/Collection {:name     "Metrics"
                                                                        :type     library-metrics-collection-type
                                                                        :location base-location})]
    (doseq [col [library data metrics]]
      (t2/delete! :model/Permissions :collection_id (:id col))
      (perms/grant-collection-read-permissions! (perms/all-users-group) col)
      (perms/grant-collection-readwrite-permissions! (perms/data-analyst-group) col))
    library))

(methodical/defmethod t2/table-name :model/Collection [_model] :collection)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :collection]
  [_original-model _k]
  :model/Collection)

(t2/deftransforms :model/Collection
  {:namespace       mi/transform-keyword
   :authority_level mi/transform-keyword})

(defn maybe-localize-system-collection-name
  "If the collection is a system-defined collection (Trash, Library, Data, or Metrics), translate the `name`.
  This is a public function because we can't rely on `define-after-select` in all circumstances, e.g. when searching
  or listing collection items (where we do a direct DB query without `:model/Collection`)."
  [collection]
  (cond-> collection
    (is-trash? collection) (assoc :name (tru "Trash"))
    (is-library? collection) (assoc :name (tru "Library"))
    (is-library-data-collection? collection) (assoc :name (tru "Data"))
    (is-library-metrics-collection? collection) (assoc :name (tru "Metrics"))))

(t2/define-after-select :model/Collection [collection]
  (maybe-localize-system-collection-name collection))

(doto :model/Collection
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

(defn- default-audit-collection?
  [{:keys [id] :as _col}]
  (when-not (audit/analytics-dev-mode)
    (= id (:id (audit/default-audit-collection)))))

(defmethod mi/can-write? :model/Collection
  ([instance]
   (and (not (default-audit-collection? instance))
        (not (is-trash-or-descendant? instance))
        (mi/current-user-has-full-permissions? :write instance)
        (remote-sync/collection-editable? instance)))
  ([_model pk]
   (mi/can-write? (t2/select-one :model/Collection pk))))

(mu/defmethod mi/can-read? :model/Collection
  ([instance]
   (or (is-trash? instance)
       (perms/can-read-audit-helper :model/Collection instance)))
  ([_model pk :- pos-int?]
   (or (is-trash? pk)
       (mi/can-read? (t2/select-one :model/Collection :id pk)))))

(def AuthorityLevel
  "Malli Schema for valid collection authority levels."
  [:enum "official"])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Slug Validation                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

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
  "*** Don't use this directly! Instead use [[location-path->ids]]. ***

  'Explode' a `location-path` into a sequence of Collection IDs, and parse them as integers. THIS DOES NOT VALIDATE
  THAT THE PATH OR RESULTS ARE VALID. This unchecked version exists solely to power the other version below."
  [location-path]
  (if (= location-path "/")
    []
    (mapv parse-long (rest (str/split location-path #"/")))))

(defn- valid-location-path? [s]
  (boolean
   (and (string? s)
        (re-matches #"^/(\d+/)*$" s)
        (let [ids (unchecked-location-path->ids s)]
          (or (empty? ids)
              (apply distinct? ids))))))

(def ^:private LocationPath
  "Schema for a directory-style 'path' to the location of a Collection."
  [:fn #'valid-location-path?])

(mu/defn location-path :- LocationPath
  "Build a 'location path' from a sequence of `collections-or-ids`.

     (location-path 10 20) ; -> \"/10/20/\""
  [& collections-or-ids :- [:* [:or ms/PositiveInt :map]]]
  (if-not (seq collections-or-ids)
    "/"
    (str
     "/"
     (str/join "/" (for [collection-or-id collections-or-ids]
                     (u/the-id collection-or-id)))
     "/")))

(mu/defn location-path->ids :- [:sequential ms/PositiveInt]
  "'Explode' a `location-path` into a sequence of Collection IDs, and parse them as integers.

     (location-path->ids \"/10/20/\") ; -> [10 20]"
  [location-path :- LocationPath]
  (unchecked-location-path->ids location-path))

(mu/defn location-path->parent-id :- [:maybe ms/PositiveInt]
  "Given a `location-path` fetch the ID of the direct parent of a Collection.

     (location-path->parent-id \"/10/20/\") ; -> 20"
  [location-path :- LocationPath]
  (last (location-path->ids location-path)))

(mu/defn all-ids-in-location-path-are-valid? :- :boolean
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
        (t2/count :model/Collection :id [:in ids])))))

(defn- assert-valid-location
  "Assert that the `location` property of a `collection`, if specified, is valid. This checks that it is valid both from
  a schema standpoint, and from a 'do the referenced Collections exist' standpoint. Intended for use as part of
  `pre-update` and `pre-insert`."
  [{:keys [location], :as collection}]
  ;; if setting/updating the `location` of this Collection make sure it matches the schema for valid location paths
  (when (contains? collection :location)
    (when-not (valid-location-path? location)
      (let [msg (tru "Invalid Collection location: path is invalid.")]
        (throw (ex-info msg {:status-code 400, :errors {:location msg}
                             :collection collection}))))
    ;; if this is a Personal Collection it's only allowed to go in the Root Collection: you can't put it anywhere else!
    (when (:personal_owner_id collection)
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
  (when (and namespace (shared-tenant-collection? collection) (not (perms/use-tenants)))
    (throw (ex-info "Can't create a tenant collection without tenants enabled." {:type (:type collection)})))
  (when location
    (when-let [parent-id (location-path->parent-id location)]
      (let [parent-namespace (t2/select-one-fn :namespace :model/Collection :id parent-id)]
        (when-not (= (keyword collection-namespace) (keyword parent-namespace))
          (let [msg (tru "Collection must be in the same namespace as its parent")]
            (throw (ex-info msg {:status-code 400, :errors {:location msg}})))))))
  ;; non-default namespace Collections cannot be personal Collections
  (when (and owner-id collection-namespace)
    (let [msg (tru "Personal Collections must be in the default namespace")]
      (throw (ex-info msg {:status-code 400, :errors {:personal_owner_id msg}})))))

(defn- assert-valid-remote-synced-parent
  "Check that if this Collection is remote-synced, its parent is either remote-synced or the root collection.

  If a collection's parent is remote-synced, it must also be remote-synced."
  [{:keys [location is_remote_synced]}]
  (when-let [parent-id (and location (location-path->parent-id location))]
    (let [parent-is-remote-synced? (t2/select-one-fn :is_remote_synced :model/Collection :id parent-id)]
      (when (and (or parent-is-remote-synced? is_remote_synced)
                 (not= parent-is-remote-synced? is_remote_synced))
        (let [msg (if is_remote_synced
                    (tru "A remote-synced Collection can only be placed in another remote-synced Collection or the root Collection.")
                    (tru "A Collection placed in a remote-synced Collection must also be remote-synced."))]
          (throw (ex-info msg {:status-code 400, :errors {:location msg}})))))))

(defenterprise check-allowed-content
  "Checks contents of a collection before saving it. The OSS implementation is a no-op."
  metabase-enterprise.library.validation
  [_model-type _collection-id]
  true)

(defenterprise check-library-update
  "Checks that a collection of type `:library` only contains allowed changes."
  metabase-enterprise.library.validation
  [_collection]
  true)

;; This function is defined later after children-location is available

(def ^:private CollectionWithLocationOrRoot
  [:or
   RootCollection
   [:map
    [:location LocationPath]]])

(def CollectionWithLocationAndIDOrRoot
  "Schema for a valid `CollectionInstance` that has valid `:location` and `:id` properties, or the special
  `root-collection` placeholder object."
  [:or
   RootCollection
   [:map
    [:location LocationPath]
    [:id       ms/PositiveInt]]])

(mu/defn- parent :- CollectionWithLocationAndIDOrRoot
  "Fetch the parent Collection of `collection`, or the Root Collection special placeholder object if this is a
  top-level Collection. Note that the `parent` of a `collection` that's in the trash is the collection it was trashed
  *from*."
  [collection :- CollectionWithLocationOrRoot]
  (if-let [new-parent-id (location-path->parent-id (:location collection))]
    (t2/select-one :model/Collection :id new-parent-id)
    root-collection))

(mu/defn children-location :- LocationPath
  "Given a `collection` return a location path that should match the `:location` value of all the children of the
  Collection.

     (children-location collection) ; -> \"/10/20/30/\";

     ;; To get children of this collection:
     (t2/select Collection :location \"/10/20/30/\")"
  [{:keys [location], :as collection} :- CollectionWithLocationAndIDOrRoot]
  (if (collection.root/is-root-collection? collection)
    "/"
    (str location (u/the-id collection) "/")))

(mu/defn descendant-ids :- [:maybe [:set ms/PositiveInt]]
  "Return a set of IDs of all descendant Collections of a `collection`."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (t2/select-pks-set :model/Collection :location [:like (str (children-location collection) \%)]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Personal Collections                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn format-personal-collection-name :- ms/NonBlankString
  "Constructs the personal collection name from user name.
  When displaying to users we'll translate it to user's locale,
  but to keeps things consistent in the database, we'll store the name in site's locale.

  Practically, use `user-or-site` = `:site` when insert or update the name in database,
  and `:user` when we need the name for displaying purposes"
  [first-name last-name email user-or-site]
  {:pre [(#{:user :site} user-or-site)]}
  (if (= :user user-or-site)
    (cond
      (and first-name last-name) (tru "{0} {1}''s Personal Collection" first-name last-name)
      :else                      (tru "{0}''s Personal Collection" (or first-name last-name email)))
    (cond
      (and first-name last-name) (trs "{0} {1}''s Personal Collection" first-name last-name)
      :else                      (trs "{0}''s Personal Collection" (or first-name last-name email)))))

(mu/defn user->personal-collection-names :- ms/Map
  "Come up with a nice name for the Personal Collection for the passed `user-or-ids`.
  Returns a map of user-id -> name"
  [user-or-ids user-or-site]
  (into {} (when-let [ids (seq (filter some? (map u/the-id user-or-ids)))]
             (t2/select-pk->fn #(format-personal-collection-name (:first_name %) (:last_name %) (:email %) user-or-site)
                               [:model/User :first_name :last_name :email :id]
                               :id [:in ids]))))

(mu/defn user->personal-collection-name :- ms/NonBlankString
  "Calls `user->personal-collection-names` for a single user-id and returns the name"
  [user-or-id user-or-site]
  (first (vals (user->personal-collection-names [user-or-id] user-or-site))))

(defn personal-collections-with-ui-details
  "Like `personal-collection-with-ui-details`, but for a sequence of collections and returns a sequence of modified collections"
  [collections]
  (let [collection-names (user->personal-collection-names (filter some? (map :personal_owner_id collections)) :user)]
    (map (fn [{:keys [personal_owner_id] :as collection}]
           (if-not personal_owner_id
             collection
             (let [collection-name (get collection-names personal_owner_id)]
               (assoc collection
                      :name collection-name
                      :slug (u/slugify collection-name))))) collections)))

(defn personal-collection-with-ui-details
  "For Personal collection, we make sure the collection's name and slug is translated to user's locale
  This is only used for displaying purposes, For insertion or updating  the name, use site's locale instead"
  [collection]
  (first (personal-collections-with-ui-details [collection])))

(defenterprise maybe-localize-tenant-collection-names
  "For tenant root collections, localize the name to the user's locale.

  OSS version: returns collections unchanged."
  metabase-enterprise.tenants.model
  [collections]
  collections)

(defn maybe-localize-tenant-collection-name
  "Single-collection version of [[maybe-localize-tenant-collection-names]]."
  [collection]
  (first (maybe-localize-tenant-collection-names [collection])))

(def ^:private CollectionWithLocationAndPersonalOwnerID
  "Schema for a Collection instance that has a valid `:location`, and a `:personal_owner_id` key *present* (but not
  necessarily non-nil)."
  [:map
   [:location          LocationPath]
   [:personal_owner_id [:maybe ms/PositiveInt]]])

(mu/defn is-personal-collection-or-descendant-of-one? :- :boolean
  "Is `collection` a Personal Collection, or a descendant of one?"
  [collection :- CollectionWithLocationAndPersonalOwnerID]
  (boolean
   (or
    ;; If collection has an owner ID we're already done here, we know it's a Personal Collection
    (:personal_owner_id collection)

    ;; Try to get the ID of its highest-level ancestor, e.g. if `location` is `/1/2/3/` we would get `1`. Then see if
    ;; the root-level ancestor is a Personal Collection (Personal Collections can only exist in the Root Collection.)
    (when-let [id (first (location-path->ids (:location collection)))]
      (t2/exists? :model/Collection
                  :id                id
                  :personal_owner_id [:not= nil])))))

(def ^:private CollectionWithNamespace
  "Schema for a Collection instance that has a valid `:location`, and a `:namespace` key *present* (but not
  necessarily non-nil)."
  [:map
   [:namespace [:maybe [:or :keyword :string]]]])

(mu/defn is-dedicated-tenant-collection-or-descendant? :- :boolean
  "Is `collection` a Tenant Collection, or a descendant of one?"
  [collection :- CollectionWithNamespace]
  (boolean
   ;; If collection has namespace = "tenant-specific" we know it's in the dedicated tenant namespace
   (= (some-> (:namespace collection) name) "tenant-specific")))

(mu/defn user->existing-personal-collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "For a `user-or-id`, return their personal Collection, if it already exists.
  Use [[metabase.collections.models.collection/user->personal-collection]] to fetch their personal Collection *and*
  create it if needed."
  [user-or-id]
  (t2/select-one :model/Collection :personal_owner_id (u/the-id user-or-id)))

(mu/defn user->personal-collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "Return the Personal Collection for `user-or-id`, if it already exists; if not, create it and return it."
  [user-or-id]
  ;; API key users do not get personal collections
  (when-not (api-key/is-api-key-user? (u/the-id user-or-id))
    (or (user->existing-personal-collection user-or-id)
        (try
          (first (t2/insert-returning-instances! :model/Collection
                                                 {:name              (user->personal-collection-name user-or-id :site)
                                                  :personal_owner_id (u/the-id user-or-id)}))
          ;; if an Exception was thrown why trying to create the Personal Collection, we can assume it was a race
          ;; condition where some other thread created it in the meantime; try one last time to fetch it
          (catch Throwable e
            (or (user->existing-personal-collection user-or-id)
                (throw e)))))))

(def ^:private ^{:arglists '([user-id])} user->personal-collection-id
  "Cached function to fetch the ID of the Personal Collection belonging to User with `user-id`. Since a Personal
  Collection cannot be deleted, the ID will not change; thus it is safe to cache, saving a DB call. It is also
  required to calculate the Current User's permissions set, which is done for every API call; thus it is cached to
  save a DB call for *every* API call."
  (memoize/ttl
   ^{::memoize/args-fn (fn [[user-id]]
                         [(mdb/unique-identifier) user-id])}
   (fn user->personal-collection-id*
     [user-id]
     (some-> user-id user->personal-collection u/the-id))
   ;; cache the results for 60 minutes; TTL is here only to eventually clear out old entries/keep it from growing too
   ;; large
   :ttl/threshold (* 60 60 1000)))

(mu/defn user->personal-collection-and-descendant-ids :- [:sequential ms/PositiveInt]
  "Somewhat-optimized function that fetches the ID of a User's Personal Collection as well as the IDs of all descendants
  of that Collection. Exists because this needs to be known to calculate the Current User's permissions set, which is
  done for every API call; this function is an attempt to make fetching this information as efficient as reasonably
  possible."
  [user-or-id]
  (into []
        (when-let [personal-collection-id (user->personal-collection-id (u/the-id user-or-id))]
          (conj
           ;; `descendant-ids` wants a CollectionWithLocationAndID, and luckily we know Personal Collections always go
           ;; in Root, so we can pass it what it needs without actually having to fetch an entire CollectionInstance
           (descendant-ids {:location "/", :id personal-collection-id})
           personal-collection-id))))

(mi/define-batched-hydration-method include-personal-collection-ids
  :personal_collection_id
  "Efficiently hydrate the `:personal_collection_id` property of a sequence of Users. (This is, predictably, the ID of
  their Personal Collection.)"
  [users]
  (when (seq users)
    ;; efficiently create a map of user ID -> personal collection ID
    (let [non-api-user-ids (t2/select-pks-set :model/User
                                              :id [:in (set (map u/the-id users))]
                                              :type [:not= :api-key])
          user-id->collection-id (when (seq non-api-user-ids)
                                   (t2/select-fn->pk :personal_owner_id :model/Collection
                                                     :personal_owner_id [:in non-api-user-ids]))]
      ;; now for each User, try to find the corresponding ID out of that map. If it's not present (the personal
      ;; Collection hasn't been created yet), then instead call `user->personal-collection-id`, which will create it
      ;; as a side-effect. This will ensure this property never comes back as `nil`
      (for [user users]
        (assoc user :personal_collection_id (when (contains? non-api-user-ids (u/the-id user))
                                              (or (get user-id->collection-id (u/the-id user))
                                                  (user->personal-collection-id (u/the-id user)))))))))

(mi/define-simple-hydration-method is-shared-tenant-collection
  :is_shared_tenant_collection
  "Hydrate the `is_shared_tenant_collection` property of collections - whether or not they're a tenant coll."
  [collection]
  (shared-tenant-collection? collection))

(mi/define-batched-hydration-method collection-is-personal
  :is_personal
  "Efficiently hydrate the `:is_personal` property of a sequence of Collections.
  `true` means the collection is or nested in a personal collection."
  [collections]
  (if (= 1 (count collections))
    (let [collection (first collections)]
      (if (some? collection)
        [(assoc collection :is_personal (is-personal-collection-or-descendant-of-one? collection))]
        ;; root collection is nil
        [collection]))
    (let [personal-collection-ids (t2/select-pks-set :model/Collection :personal_owner_id [:not= nil])
          location-is-personal    (fn [location]
                                    (boolean
                                     (and (string? location)
                                          (some #(str/starts-with? location (format "/%d/" %)) personal-collection-ids))))]
      (map (fn [{:keys [location personal_owner_id] :as coll}]
             (if (some? coll)
               (assoc coll :is_personal (or (some? personal_owner_id)
                                            (location-is-personal location)))
               nil))
           collections))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Nested Collections: "Effective" Location Paths                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; "Effective" Location Paths are location paths for Collections that exclude the IDs of Collections the current user
;; isn't allowed to see.
;;
;; For example, if a Collection has a `location` of `/10/20/30/`, and the current User is allowed to see Collections
;; 10 and 30, but not 20, we will show them an "effective" location path of `/10/30/`. This is used for things like
;; breadcrumbing in the frontend.

(def ^:private VisibleCollections
  "Includes the possible values for visible collections, possibly including `\"root\"` to represent the root
  collection."
  [:set
   [:or [:= "root"] ms/PositiveInt]])

(def ^:private CollectionVisibilityConfig
  [:map
   [:cte-name {:optional true} [:maybe :keyword]]
   [:include-trash-collection? {:optional true} :boolean]
   [:include-archived-items {:optional true} [:enum :only :exclude :all]]
   [:archive-operation-id {:optional true} [:maybe :string]]
   [:permission-level {:optional true} [:enum :read :write]]
   [:effective-child-of {:optional true} [:maybe CollectionWithLocationAndIDOrRoot]]])

(def ^:private UserScope
  [:map
   [:current-user-id pos-int?]
   [:is-superuser?   :boolean]])

(def ^:private default-visibility-config
  {:cte-name nil
   :include-archived-items :exclude
   :include-trash-collection? false
   :effective-child-of nil
   :archive-operation-id nil
   :permission-level :read})

(def ^:private ^{:arglists '([user-scope read-or-write])} can-access-root-collection?
  "Cached function to determine whether the current user can access the root collection"
  (memoize/ttl
   ^{::memoize/args-fn (fn [[{:keys [current-user-id]} read-or-write]]
                         ;; If this is running in the context of a request, cache it for the duration of that request.
                         ;; Otherwise, don't cache the results at all.)
                         (if-let [req-id *request-id*]
                           [req-id current-user-id read-or-write]
                           [(random-uuid) current-user-id read-or-write]))}
   (fn can-access-root-collection?*
     [{:keys [current-user-id is-superuser?]} read-or-write]
     (or is-superuser?
         (t2/exists? :model/Permissions {:select [:p.*]
                                         :from [[:permissions :p]]
                                         :join [[:permissions_group :pg] [:= :pg.id :p.group_id]
                                                [:permissions_group_membership :pgm] [:= :pgm.group_id :pg.id]]
                                         :where [:and
                                                 [:= :pgm.user_id current-user-id]
                                                 [:or
                                                  [:= :p.object "/collection/root/"]
                                                  (when (= :read read-or-write)
                                                    [:= :p.object "/collection/root/read/"])]]})))
   ;; cache the results for 10 seconds. This is a bit arbitrary but should be long enough to cover ~all requests.
   :ttl/threshold (* 10 1000)))

(defn should-display-root-collection?
  "Should this user be shown the root collection, given the `visibility-config` passed?"
  ([visibility-config]
   (should-display-root-collection?
    {:current-user-id api/*current-user-id*
     :is-superuser?   api/*is-superuser?*}
    visibility-config))
  ([user-scope visibility-config]
   (and
    ;; we have permission for it.
    (can-access-root-collection? user-scope (:permission-level visibility-config))

    ;; we're not *only* looking for archived items
    (not= :only (:include-archived-items visibility-config))

    ;; we're not looking for a particular `archive_operation_id`
    (not (:archive-operation-id visibility-config)))))

(def ^:private visible-union-columns
  [:c.id
   :c.location
   :c.archived
   :c.archive_operation_id
   :c.archived_directly
   :c.type
   :c.namespace])

(mu/defn visible-collection-query
  "Given a `CollectionVisibilityConfig`, return a HoneySQL query that selects all visible Collection IDs."
  ([visibility-config :- CollectionVisibilityConfig]
   (visible-collection-query visibility-config
                             {:current-user-id api/*current-user-id*
                              :is-superuser?   api/*is-superuser?*}))

  ([visibility-config :- CollectionVisibilityConfig
    {:keys [current-user-id is-superuser?]} :- UserScope]
   ;; This giant query looks scary, but it's actually only moderately terrifying! Let's walk through it step by
   ;; step. What we're doing here is adding a filter clause to a surrounding query, to make sure that
   ;; `collection-id-field` matches the criteria passed by the user. The criteria we use are:
   ;;
   ;; - your permissions (we don't show you something you don't have the right to see)
   ;; - the desired permission level you need (if you're looking for stuff you can WRITE, we don't show you stuff you can READ)
   ;; - trash (you can show/hide the trash)
   ;; - archived (you can show/hide archived collections or select *only* archived collections)
   ;; - archive operation id (when we archive a collection and subcollections together, we mark the whole archived
   ;;   tree so you can look at it in isolation)
   ;; - effective child (if you're only interested in things that are an effective child of another collection, we can do that)
   {:select :id
    ;; the `FROM` clause is where we limit the collections to the ones we have permissions on. For a superuser,
    ;; that's all of them. For regular users, it's:
    ;; a) the collections they have permission in the DB for,
    ;; b) the trash collection, and
    ;; c) their personal collection and its descendants
    :from [(if is-superuser?
             [:collection :c]
             [{:union-all (keep identity [{:select visible-union-columns
                                           :from   [[:collection :c]]
                                           :where [:and [:exists {:select [1]
                                                                  :from [[:permissions :p]]
                                                                  :inner-join [[:permissions_group_membership :pgm] [:= :p.group_id :pgm.group_id]]
                                                                  :where [:and
                                                                          [:= :pgm.user_id [:inline current-user-id]]
                                                                          [:= :c.id :p.collection_id]
                                                                          [:= :p.perm_type (h2x/literal "perms/collection-access")]
                                                                          [:or
                                                                           [:= :p.perm_value (h2x/literal "read-and-write")]
                                                                           (when (= :read (:permission-level visibility-config))
                                                                             [:= :p.perm_value (h2x/literal "read")])]]}]]}
                                          {:select visible-union-columns
                                           :from   [[:collection :c]]
                                           :where  [:= :type (h2x/literal trash-collection-type)]}
                                          (when-let [personal-collection-and-descendant-ids
                                                     (seq (user->personal-collection-and-descendant-ids current-user-id))]
                                            {:select visible-union-columns
                                             :from   [[:collection :c]]
                                             :where  [:in :id [:inline personal-collection-and-descendant-ids]]})
                                          (when-let [tenant-collection-and-descendant-ids (seq (perms/user->tenant-collection-and-descendant-ids current-user-id))]
                                            {:select visible-union-columns
                                             :from [[:collection :c]]
                                             :where [:in :id [:inline tenant-collection-and-descendant-ids]]})
                                          (when (perms/is-data-analyst? current-user-id)
                                            {:select visible-union-columns
                                             :from [[:collection :c]]
                                             :where [:= :namespace [:inline "transforms"]]})])}
              :c])]
    ;; The `WHERE` clause is where we apply the other criteria we were given:
    :where [:and
            ;; hiding the trash collection when desired...
            (when-not (:include-trash-collection? visibility-config)
              [:not= [:inline (trash-collection-id)] :c.id])

            ;; hiding archived items when desired...
            (when (= :exclude (:include-archived-items visibility-config))
              [:= :c.archived false])

            ;; (or showing them, if that's what you want)
            (when (= :only (:include-archived-items visibility-config))
              [:or
               [:= :c.archived true]
               ;; the trash collection is included when viewing archived-only
               [:= :id [:inline (trash-collection-id)]]])

            (when-not (perms/use-tenants)
              [:not [:exists {:select [1]
                              :from [[:collection :sub_c]]
                              :where [:and [:= :c.id :sub_c.id]
                                      [:= :sub_c.namespace [:inline "shared-tenant-collection"]]]}]])

            ;; excluding things outside of the `archive_operation_id` you wanted...
            (when-let [op-id (:archive-operation-id visibility-config)]
              [:or
               [:= :c.archive_operation_id [:inline op-id]]
               ;; the trash collection is part of every `archive_operation`
               [:= :id (trash-collection-id)]])]}))

(mu/defn visible-collection-filter-clause
  "Given a `CollectionVisibilityConfig`, return a HoneySQL filter clause ready for use in queries. Takes an optional
  `cte-name` in the visibility config which is used as the source for collection IDs if provided; otherwise, we filter
  based on the results of `visible-collection-query` above."
  ([]
   (visible-collection-filter-clause :collection_id))
  ([collection-id-field :- [:or [:tuple [:= :coalesce] :keyword :keyword] :keyword]]
   (visible-collection-filter-clause collection-id-field {}))
  ([collection-id-field :- [:or [:tuple [:= :coalesce] :keyword :keyword] :keyword]
    visibility-config :- CollectionVisibilityConfig]
   (visible-collection-filter-clause collection-id-field
                                     visibility-config
                                     {:current-user-id api/*current-user-id*
                                      :is-superuser?   api/*is-superuser?*}))
  ([collection-id-field :- [:or [:tuple [:= :coalesce] :keyword :keyword] :keyword]
    visibility-config :- CollectionVisibilityConfig
    user-scope :- UserScope]
   (let [{:keys [cte-name] :as visibility-config} (merge default-visibility-config visibility-config)]
     [:or
      (when (should-display-root-collection? user-scope visibility-config)
        [:= collection-id-field nil])
      ;; the non-root collections are here. We're saying "let this row through if..."
      [:in
       collection-id-field
       (if cte-name
         {:select :id :from cte-name}
         (visible-collection-query visibility-config user-scope))]])))

(defn- effective-child-of-filter-clause
  [parent-coll collection-table-alias visibility-config]
  (let [->col (fn [col-name]
                (keyword (str (name collection-table-alias)
                              "."
                              col-name)))]
    [:and
     (visible-collection-filter-clause (->col "id") visibility-config)
     (if (is-trash? parent-coll)
       [:= (->col "archived_directly") true]
       [:and
        ;; an effective child is a descendant of the parent collection
        [:like (->col "location") (str (children-location parent-coll) "%")]

        ;; but NOT a child of any OTHER visible collection.
        [:not [:exists {:select 1
                        :from [[:collection :c2]]
                        :where [:and
                                (visible-collection-filter-clause :c2.id visibility-config)
                                [:= (->col "location") [:concat :c2.location :c2.id (h2x/literal "/")]]
                                (when-not (collection.root/is-root-collection? parent-coll)
                                  [:not= :c2.id [:inline (u/the-id parent-coll)]])]}]]])]))

(def ^{:arglists '([visibility-config])} visible-collection-ids*
  "Impl for `visible-collection-ids`, caches for the lifetime of the request, maximum 10 seconds."
  (memoize/ttl
   ^{::memoize/args-fn (fn [[visibility-config]]
                         (if-let [req-id *request-id*]
                           [req-id api/*current-user-id* visibility-config]
                           [(random-uuid) api/*current-user-id* visibility-config]))}
   (fn
     [visibility-config]
     (cond-> (t2/select-pks-set :model/Collection {:where (visible-collection-filter-clause :id visibility-config)})
       (should-display-root-collection? visibility-config)
       (conj "root")))
   ;; cache the results for 60 minutes; TTL is here only to eventually clear out old entries/keep it from growing too
   ;; large
   :ttl/threshold (* 60 60 1000)))

(mu/defn visible-collection-ids :- VisibleCollections
  "Returns all collection IDs that are visible given the `visibility-config` passed in. (Config provides knobs for
  toggling permission level, trash/archive visibility, etc). If you're trying to filter based on this, you should
  probably use `visible-collection-filter-clause` instead."
  [visibility-config :- CollectionVisibilityConfig]
  (visible-collection-ids* visibility-config))

(mi/define-batched-hydration-method effective-location-path*
  :effective_location
  "Given a seq of `collections`, batch hydrates them with their effective location."
  [collections]
  (when (seq collections)
    (let [collection-ids (visible-collection-ids {:include-archived-items :all
                                                  :include-trash-collection? true})]
      (for [collection collections]
        (when (some? collection)
          (assoc collection
                 :effective_location
                 (when-not (collection.root/is-root-collection? collection)
                   (let [real-location-path (if (:archived_directly collection)
                                              (trash-path)
                                              (:location collection))]
                     (apply location-path (for [id    (location-path->ids real-location-path)
                                                :when (contains? collection-ids id)]
                                            id))))))))))

(defn effective-location-path
  "Given a collection, returns the effective location (hiding parts of the path that the current user doesn't have access to)."
  [collection]
  (:effective_location (t2/hydrate collection :effective_location)))

(def ^:private effective-parent-fields
  "Fields that should be included when hydrating the `:effective_parent` of a collection. Used for displaying recent views
  and collection search results."
  [:id :name :authority_level :type])

(defn- effective-parent-root []
  (select-keys
   (collection.root/root-collection-with-ui-details {})
   effective-parent-fields))

(mi/define-batched-hydration-method effective-parent
  :effective_parent
  "Given a seq of `collections`, batch hydrates them with their `:effective_parent`, their parent collection in their
  effective location. (i.e. the most recent ancestor the current user has read access to). If :effective_location is not
  present on any collections, it is hydrated as well, as it is needed to compute the effective parent."
  [collections]
  (let [collections     (t2/hydrate collections :effective_location)
        parent-ids      (->> collections
                             (map :effective_location)
                             (keep location-path->parent-id))
        id->parent-coll (merge {nil (effective-parent-root)}
                               (when (seq parent-ids)
                                 (t2/select-pk->fn identity :model/Collection
                                                   {:select effective-parent-fields
                                                    :where [:in :id parent-ids]})))]
    (map
     (fn [collection]
       (let [parent-id (-> collection :effective_location location-path->parent-id)]
         (assoc collection :effective_parent (id->parent-coll parent-id))))
     collections)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                          Nested Collections: Ancestors, Children, Child Collections                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- ancestors* :- [:maybe [:sequential (ms/InstanceOf :model/Collection)]]
  [{:keys [location]}]
  (when-let [ancestor-ids (seq (location-path->ids location))]
    (t2/select [:model/Collection :name :id :personal_owner_id]
               :id [:in ancestor-ids]
               {:order-by [:location]})))

(mi/define-simple-hydration-method ancestors
  :ancestors
  "Fetch ancestors (parent, grandparent, etc.) of a `collection`. These are returned in order starting with the
  highest-level (e.g. most distant) ancestor."
  [collection]
  (ancestors* collection))

(mu/defn- effective-ancestors*
  "Given a collection, return the effective ancestors of that collection."
  [collection :- [:maybe CollectionWithLocationOrRoot]
   collection-id->collection :- :map]
  (if (or (nil? collection)
          (collection.root/is-root-collection? collection))
    []
    (some->> (effective-location-path collection)
             location-path->ids
             (map collection-id->collection)
             (map #(select-keys % [:name :id :personal_owner_id :type]))
             (map #(t2/instance :model/Collection %))
             (cons (root-collection-with-ui-details (:namespace collection)))
             (filter mi/can-read?))))

(mi/define-batched-hydration-method effective-ancestors
  :effective_ancestors
  "Efficiently hydrate the ancestors of a `collection`, filtering out any ones the current User isn't allowed to see.
  This is used in the UI to power the 'breadcrumb' path to the location of a given Collection. For example, suppose we
  have four Collections, nested like:

    A > B > C > D

  The ancestors of D are:

    [Root] > A > B > C

  If the current User is allowed to see A and C, but not B, `effective-ancestors` of D will be:

    [Root] > A > C

  Thus the existence of C will be kept hidden from the current User, and for all intents and purposes the current User
  can effectively treat A as the parent of C."
  [collections]
  (let [all-ids (mapcat #(some-> % effective-location-path location-path->ids) collections)
        collection-id->collection (if (seq all-ids)
                                    (t2/select-pk->fn identity :model/Collection :id [:in all-ids])
                                    {})]
    (map (fn [collection]
           (assoc collection
                  :effective_ancestors
                  (effective-ancestors* collection collection-id->collection)))
         collections)))

(mu/defn- parent-id* :- [:maybe ms/PositiveInt]
  [{:keys [location]} :- CollectionWithLocationOrRoot]
  (some-> location location-path->parent-id))

(methodical/defmethod t2/simple-hydrate [:default :parent_id]
  "Get the immediate parent `collection` id, if set."
  [_model k collection]
  (assoc collection k (parent-id* collection)))

(def ^:private Children
  [:schema
   {:registry {::children [:and
                           (ms/InstanceOf :model/Collection)
                           [:map
                            [:children [:set [:ref ::children]]]]]}}
   [:ref ::children]])

(mu/defn descendants-flat :- [:sequential CollectionWithLocationAndIDOrRoot]
  "Return all descendant collections of a `collection`, including children, grandchildren, and so forth."
  [collection :- CollectionWithLocationAndIDOrRoot, & additional-honeysql-where-clauses]
  (or
   (t2/select [:model/Collection :name :id :location :description]
              {:where (apply
                       vector
                       :and
                       [:like :location (str (children-location collection) "%")]
                       ;; Only return the Personal Collection belonging to the Current
                       ;; User, regardless of whether we should actually be allowed to see
                       ;; it (e.g., admins have perms for all Collections). This is done
                       ;; to keep the Root Collection View for admins from getting crazily
                       ;; cluttered with Personal Collections belonging to other users
                       [:or
                        [:= :personal_owner_id nil]
                        [:= :personal_owner_id *current-user-id*]]
                       additional-honeysql-where-clauses)})
   []))

(mu/defn descendants :- [:set Children]
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
  (let [location->children (group-by :location (apply descendants-flat collection additional-honeysql-where-clauses))
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

(mu/defn- effective-children-where-clause
  "Given a collection, return the `WHERE` clause appropriate to return all the collections we want to show as its
  effective children."
  [collection collection-table-alias visibility-config & additional-honeysql-where-clauses]
  (into
   [:and
    (effective-child-of-filter-clause collection collection-table-alias visibility-config)
    ;; don't want personal collections in collection items. Only on the sidebar
    [:= :personal_owner_id nil]]
   ;; (any additional conditions)
   additional-honeysql-where-clauses))

(mu/defn effective-children-query :- [:map
                                      [:select :any]
                                      [:from   :any]
                                      [:where  :any]]
  "Return a query for the descendant Collections of a `collection`
  that should be presented to the current user as the children of this Collection.
  This takes into account descendants that get filtered out when the current user can't see them. For
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
  [collection :- CollectionWithLocationAndIDOrRoot
   visibility-config :- CollectionVisibilityConfig
   & additional-honeysql-where-clauses]
  {:select [:id :name :description]
   :from   [[:collection :col]]
   :where  (apply effective-children-where-clause collection :col visibility-config additional-honeysql-where-clauses)})

(mu/defn- effective-children* :- [:set (ms/InstanceOf :model/Collection)]
  [collection :- CollectionWithLocationAndIDOrRoot & additional-honeysql-where-clauses]
  (set (t2/select [:model/Collection :id :name :description]
                  {:where (apply effective-children-where-clause
                                 collection
                                 (t2/table-name :model/Collection)
                                 default-visibility-config
                                 additional-honeysql-where-clauses)})))

(mi/define-simple-hydration-method effective-children
  :effective_children
  "Get the descendant Collections of `collection` that should be presented to the current User as direct children of
  this Collection. See documentation for [[metabase.collections.models.collection/effective-children-query]] for more
  details."
  [collection & additional-honeysql-where-clauses]
  (apply effective-children* collection additional-honeysql-where-clauses))

;;; -------------------------------------------------- Remote Sync -------------------------------------------------------

(defn- traverse-descendants
  [node skip-archived]
  (loop [to-traverse {node nil}
         traversed   {}
         accum       {}]
    (let [item        (first to-traverse)
          found       (let [[mod id] (key item)]
                        (serdes/descendants mod id {:skip-archived skip-archived}))
          traversed   (conj traversed item)
          to-traverse (merge-with into
                                  (dissoc to-traverse (key item))
                                  (apply dissoc found (keys traversed)))
          accum (merge-with concat accum (update-vals found vector))]
      (if (empty? to-traverse)
        accum
        (recur to-traverse traversed accum)))))

(defn remote-synced-dependents
  "Finds dependents of a model that are contained in ANY remote-synced collection.

  For cards, checks if there are any other queries that reference this card. For collections, checks dependents of
  all cards in the collection or subcollections. For all other models it returns an empty seq. Only checks for
  immediate dependents.

  All remote-synced collections are treated as a unified pool - dependents in any remote-synced collection
  (regardless of root) are returned.

  Takes model (the model to check dependents for).

  Returns a sequence of models immediately dependent on the provided model that are in any remote-synced collection."
  [{:keys [id archived] :as model}]
  (let [;; Get ALL top-level remote-synced collections
        all-remote-synced-roots (t2/select-pks-set :model/Collection
                                                   {:where [:and
                                                            [:= :is_remote_synced true]
                                                            [:= :location "/"]]})
          ;; Traverse descendants of all remote-synced roots combined
        all-remote-synced-descendants (reduce (fn [accum root-id]
                                                (merge-with concat accum
                                                            (traverse-descendants ["Collection" root-id] true)))
                                              {}
                                              all-remote-synced-roots)]
    (case (t2/model model)
      :model/Collection
        ;; Get all descendants of the collection being moved and see if any of them are present in the
        ;; set of all descendants across all remote-synced roots
      (->> (traverse-descendants ["Collection" id] (not archived))
           keys
           (mapcat #(get all-remote-synced-descendants %)))

        ;; If this is not a collection see if the provided model appears anywhere in the descendants of
        ;; any remote-synced collection
      (get all-remote-synced-descendants [(name (t2/model model)) id] []))))

(defn non-remote-synced-dependencies
  "Finds dependencies of a model that are not contained in ANY remote-synced collection.

  Checks for dependencies that could be contained in a remote-synced collection but are not.
  All remote-synced collections are treated as a unified pool - a dependency in any remote-synced
  collection (regardless of root) is considered valid.

  Uses serdes/descendants to list dependencies of a model.

  Takes model (the model to check dependencies for).

  Returns a set of model IDs for dependencies of the given model that are not in any remote-synced collection."
  [{:keys [id] :as model}]
  (if (t2/select-one :model/Collection :id (if (= (t2/model model) :model/Collection) (:id model) (:collection_id model)))
    (let [descendants (u/group-by first second (keys (traverse-descendants [(name (t2/model model)) id] true)))]
      (apply set/union (for [m (collectable-models)
                             :let [key (name m)]]
                         (set/difference (set (get descendants key))
                                         (t2/select-pks-set m {:inner-join [[:collection :c]
                                                                            [:and
                                                                             [:= :c.id :collection_id]
                                                                             [:= :c.is_remote_synced true]]]})))))
    #{}))

(defn check-non-remote-synced-dependencies
  "Checks if a model has non-remote-synced-dependencies and throws if it does.

  Takes model (the model to check dependencies for).

  Returns the model if no non-remote-synced dependencies are found.

  Throws an ex-info object with non-remote-synced-dependencies and a 400 status code if dependencies are found."
  [model]
  (when-let [non-remote-synced-deps (not-empty (non-remote-synced-dependencies model))]
    (throw (ex-info (str (deferred-tru "Uses content that is not remote synced."))
                    {:non-remote-synced-models non-remote-synced-deps
                     :status-code 400})))
  model)

(defn check-remote-synced-dependents
  "Checks if a model has remote-synced-dependents and throws if it does.

  Takes model (the model to check dependencies for).

  Returns the model if no remote-synced dependents are found.

  Throws an ex-info object with remote-synced-dependencies and a 400 status code if dependents are found."
  [model]
  (when-let [remote-synced-deps (not-empty (remote-synced-dependents model))]
    (throw (ex-info (str (deferred-tru "Used by remote synced content."))
                    {:remote-synced-models remote-synced-deps
                     :status-code 400})))
  model)

(defn moving-into-remote-synced?
  "Tests if a move means the object is moving into a remote-synced collection from outside.

  Returns true only when moving from a non-remote-synced collection into a remote-synced collection.
  Moving between remote-synced collections (even with different roots) returns false.

  Takes old-collection-id (id of the collection the object is being moved from) and new-collection-id (id of the
  collection the object is being moved to)."
  [old-collection-id new-collection-id]
  (boolean
   (and (some? new-collection-id)
        (t2/exists? :model/Collection :id new-collection-id :is_remote_synced true)
        (or (nil? old-collection-id)
            (not (t2/exists? :model/Collection :id old-collection-id :is_remote_synced true))))))

(defn moving-from-remote-synced?
  "Tests if a move means the object is leaving remote-synced collections entirely.

  Returns true only when moving from a remote-synced collection to a non-remote-synced collection.
  Moving between remote-synced collections (even with different roots) returns false.

  Takes old-collection-id (id of the collection the object is being moved from) and new-collection-id (id of the
  collection the object is being moved to)."
  [old-collection-id new-collection-id]
  (boolean
   (and (some? old-collection-id)
        (t2/exists? :model/Collection :id old-collection-id :is_remote_synced true)
        (or (nil? new-collection-id)
            (not (t2/exists? :model/Collection :id new-collection-id :is_remote_synced true))))))

(defn check-for-remote-sync-update
  "Checks collection items for remote-sync integrity during an update transaction.

  Verifies remote-sync integrity after the app database has been updated but before the transaction is committed.

  Takes model-before-update (model being checked before changes have been applied, containing the updates map of
  changes that have been applied to the database).

  Returns the model with the changes applied.

  Throws an ex-info object if remote-sync integrity is violated."
  [{id :id collection-before-update :collection_id :as model-before-update}]
  (u/prog1 (t2/select-one (t2/model model-before-update) :id id)
    (let [{collection-after-update :collection_id :as model-after-update} <>]
      (when (remote-synced-collection? collection-after-update)
        (check-non-remote-synced-dependencies model-after-update)
        (when (api/column-will-change? :archived model-before-update model-after-update)
          (check-remote-synced-dependents model-after-update)))
      (when (and (api/column-will-change? :collection_id model-before-update model-after-update)
                 (moving-from-remote-synced? collection-before-update collection-after-update))
        (check-remote-synced-dependents model-after-update)))))

(methodical/defmethod t2/batched-hydrate [:default :is_remote_synced]
  "Batch hydration for whether an item is remote synced"
  [_model k items]
  (mi/instances-with-hydrated-data items k
                                   #(into {}
                                          (map (juxt :id :is_remote_synced)
                                               items))
                                   :id
                                   {:default false}))

(methodical/defmethod t2/batched-hydrate [:perms/use-parent-collection-perms :collection_namespace]
  "Batch hydration for whether an item is remote synced"
  [model k items]
  (mi/instances-with-hydrated-data items k
                                   #(into {}
                                          (t2/select-pk->fn :namespace [model :id [:c.namespace :namespace]]
                                                            {:where [:in (keyword (str (name (t2/table-name model)) ".id"))
                                                                     (map :id items)]
                                                             :join [[:collection :c]
                                                                    [:= :collection_id :c.id]]}))
                                   :id
                                   {:default nil}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Recursive Operations: Moving & Archiving                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn perms-for-collection-and-descendants :- [:set perms/PathSchema]
  "Return the set of write permissions for this collection and all its descendants.

  This is useful for operations that need to modify a collection *and* its descendants - for example, moving
  or archiving a collection necessarily moves/archives all its descendants as well, so permissions on those
  are required as well.

  Note that technically these operations could be seen as modifying the parent as well (e.g., moving
  a collection out of a parent collection modifies the parent's content) but it seems confusing if a
  user can't archive a collection they have permissions on because of the parent permissions."
  [collection :- CollectionWithLocationAndIDOrRoot]
  ;; Make sure we're not trying to operate on the Root Collection...
  (when (collection.root/is-root-collection? collection)
    (throw (Exception. (tru "You cannot operate on the Root Collection."))))
  ;; Make sure we're not trying to operate on the Custom Reports Collection...
  (when (= (audit/default-custom-reports-collection) collection)
    (throw (Exception. (tru "You cannot operate on the Custom Reports Collection."))))
  ;; also make sure we're not trying to operate on a PERSONAL Collection
  (when (t2/exists? :model/Collection :id (u/the-id collection), :personal_owner_id [:not= nil])
    (throw (Exception. (tru "You cannot operate on a Personal Collection."))))
  (set
   (for [collection-or-id (cons
                           collection
                           (t2/select-pks-set :model/Collection
                                              :location [:like (str (children-location collection) "%")]
                                              :archived false))]
     (perms/collection-readwrite-path collection-or-id))))

(mu/defn perms-for-archiving :- [:set perms/PathSchema]
  "Return the set of Permissions needed to archive or unarchive a `collection`. Since archiving a Collection is
  *recursive* (i.e., it applies to all the descendant Collections of that Collection), we require write ('curate')
  permissions for the Collection itself and all its descendants, but not for its parent Collection.

  For example, suppose we have a Collection hierarchy like:

    A > B > C

  To archive B, you need write permissions for B and C:

  *  B, because you are archiving it
  *  C, because by archiving its parent, you are archiving it as well

  You do NOT need permissions for A (the parent), as you're not modifying A itself, only removing B from it."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (perms-for-collection-and-descendants collection))

(mu/defn perms-for-moving :- [:set perms/PathSchema]
  "Return the set of Permissions needed to move a `collection`. Moving is recursive, so we require
  perms for the Collection and its descendants, plus permissions for the new parent Collection.

  For example, suppose we have a Collection hierarchy of three Collections, A, B, and C, and a fourth Collection, D,
  and we want to move B from A to D:

    A > B > C        A
               ===>
    D                D > B > C

  To move B, you would need write permissions for B, C, and D:

  *  B, since it's the Collection we're operating on
  *  C, since it will by definition be affected too
  *  D, because it's the new parent Collection, and moving something into it requires write perms

  You do NOT need permissions for A (the current parent), as moving out of a collection doesn't modify the parent."
  [collection :- CollectionWithLocationAndIDOrRoot
   new-parent :- CollectionWithLocationAndIDOrRoot]
  ;; Make sure we're not trying to move the Root Collection...
  (when (collection.root/is-root-collection? collection)
    (throw (Exception. (tru "You cannot move the Root Collection."))))
  ;; Needless to say, it makes no sense to move a Collection into itself or into one of its descendants. So let's make
  ;; sure we're not doing that...
  (when (contains? (set (location-path->ids (children-location new-parent)))
                   (u/the-id collection))
    (throw (Exception. (tru "You cannot move a Collection into itself or into one of its descendants."))))
  (set
   (cons (perms/collection-readwrite-path new-parent)
         (perms-for-collection-and-descendants collection))))

(mu/defn collection->descendant-ids :- [:maybe [:set ms/PositiveInt]]
  "Gets the IDs of all descendant collections for a given collection.

  Takes collection (a collection with location and ID or root collection) and additional-conditions (optional
  additional conditions to filter descendants).

  Returns a set of positive integers representing descendant collection IDs, or nil if none exist."
  [collection :- CollectionWithLocationAndIDOrRoot, & additional-conditions]
  (apply t2/select-pks-set :model/Collection
         :location [:like (str (children-location collection) "%")]
         additional-conditions))

(mu/defn perms-for-unarchiving :- [:set perms/PathSchema]
  "Return the set of Permissions needed to unarchive a `collection`. Since unarchiving is
  *recursive* (all descendants archived together get unarchived), we require write ('curate')
  permissions for the collection and all descendants being unarchived."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (let [archive-operation-id (:archive_operation_id collection)
        descendant-ids (collection->descendant-ids collection
                                                   :archive_operation_id [:= archive-operation-id]
                                                   :archived [:= true])]
    (set
     (cons (perms/collection-readwrite-path collection)
           (map perms/collection-readwrite-path descendant-ids)))))

(mu/defn archive-collection!
  "Mark a collection as archived, along with all its children."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (api/check-403
   (perms/set-has-full-permissions-for-set?
    @api/*current-user-permissions-set*
    (perms-for-archiving collection)))
  (api/check-400
   (not= (:type collection) "tenant-specific-root-collection"))
  (t2/with-transaction [_conn]
    (let [archive-operation-id    (str (random-uuid))
          affected-collection-ids (cons (u/the-id collection)
                                        (collection->descendant-ids collection
                                                                    :archived [:not= true]))]
      (t2/update! :model/Collection (u/the-id collection)
                  {:archive_operation_id archive-operation-id
                   :archived_directly    true
                   :archived             true})
      (t2/query-one
       {:update :collection
        :set    {:archive_operation_id archive-operation-id
                 :archived_directly    false
                 :archived             true}
        :where  [:and
                 [:like :location (str (children-location collection) "%")]
                 [:not :archived]]})
      (doseq [model (apply disj (collectable-models) (archived-directly-models))]
        (t2/update! model {:collection_id [:in affected-collection-ids]}
                    {:archived true}))
      (doseq [model (archived-directly-models)]
        (t2/update! model {:collection_id    [:in affected-collection-ids]
                           :archived_directly false}
                    {:archived true})))
    (let [updated-collection (t2/select-one :model/Collection :id (:id collection))]
      (when (:is_remote_synced updated-collection)
        (check-remote-synced-dependents updated-collection)))))

(mu/defn unarchive-collection!
  "Mark a collection as unarchived, along with any children that were archived along with the collection."
  [collection :- CollectionWithLocationAndIDOrRoot
   ;; `updates` is a map *possibly* containing `parent_id`. This allows us to distinguish
   ;; between specifying a `nil` parent_id (move to the root) and not specifying a parent_id.
   updates :- [:map [:parent_id {:optional true} [:maybe ms/PositiveInt]]]]
  (assert (:archive_operation_id collection))
  (let [archive-operation-id    (:archive_operation_id collection)
        current-parent-id       (:parent_id (t2/hydrate collection :parent_id))
        new-parent-id           (if (contains? updates :parent_id)
                                  (:parent_id updates)
                                  current-parent-id)
        new-parent              (if new-parent-id
                                  (t2/select-one :model/Collection :id new-parent-id)
                                  root-collection)
        new-parent-is-remote-synced? (:is_remote_synced new-parent)
        new-location            (children-location new-parent)
        orig-children-location  (children-location collection)
        new-children-location   (children-location (assoc collection :location new-location))
        affected-collection-ids (cons (u/the-id collection)
                                      (collection->descendant-ids collection
                                                                  :archive_operation_id [:= archive-operation-id]
                                                                  :archived [:= true]))]
    (api/check-400
     (and (some? new-parent) (not (:archived new-parent))))

    (if (contains? updates :parent_id)
      (api/check-403
       (and (mi/can-write? new-parent)
            (perms/set-has-full-permissions-for-set?
             @api/*current-user-permissions-set*
             (perms-for-unarchiving collection))))
      ;; Restoring to original location, use `can_restore` for a single source of truth
      (api/check-403
       (:can_restore (t2/hydrate collection :can_restore))))

    (t2/with-transaction [_conn]
      (t2/update! :model/Collection (u/the-id collection)
                  {:location             new-location
                   :is_remote_synced (boolean new-parent-is-remote-synced?)
                   :archive_operation_id nil
                   :archived_directly    nil
                   :archived             false})
      (t2/query-one
       {:update :collection
        :set    {:location             [:replace :location orig-children-location new-children-location]
                 :is_remote_synced (boolean new-parent-is-remote-synced?)
                 :archive_operation_id nil
                 :archived_directly    nil
                 :archived             false}
        :where  [:and
                 [:like :location (str orig-children-location "%")]
                 [:= :archive_operation_id (:archive_operation_id collection)]
                 [:not= :archived_directly true]]})
      (doseq [model (apply disj (collectable-models) (archived-directly-models))]
        (t2/update! model {:collection_id [:in affected-collection-ids]}
                    {:archived false}))
      (doseq [model (archived-directly-models)]
        (t2/update! model {:collection_id     [:in affected-collection-ids]
                           :archived_directly false}
                    {:archived false}))
      (when (:is_remote_synced collection)
        (check-non-remote-synced-dependencies collection)))))

(mu/defn archive-or-unarchive-collection!
  "Archive or un-archive a collection. When unarchiving, you may need to specify a new `parent_id`."
  [collection :- CollectionWithLocationAndIDOrRoot
   ;; `updates` is a map *possibly* containing `parent_id`. This allows us to distinguish
   ;; between specifying a `nil` parent_id (move to the root) and not specifying a parent_id.
   updates :- [:map [:parent_id {:optional true} [:maybe ms/PositiveInt]
                     :archived :boolean]]]
  (if (:archived updates)
    (archive-collection! collection)
    (unarchive-collection! collection updates)))

(mu/defn move-collection!
  "Move a Collection and all its descendant Collections from its current `location` to a `new-location`."
  [collection :- CollectionWithLocationAndIDOrRoot
   new-location :- LocationPath
   & [into-remote-synced? :- :boolean]]
  (let [orig-children-location (children-location collection)
        new-children-location  (children-location (assoc collection :location new-location))
        will-be-in-trash? (str/starts-with? new-location (trash-path))
        will-be-in-remote-synced? (t2/select-one-fn :is_remote_synced :model/Collection :id (parent-id* {:location new-location}))]
    (when will-be-in-trash?
      (throw (ex-info "Cannot `move-collection!` into the Trash. Call `archive-collection!` instead."
                      {:collection collection
                       :new-location new-location})))
    (when (= (:type collection) "tenant-specific-root-collection")
      (throw (ex-info "Can't move a tenant collection" {:status-code 400})))
    ;; first move this Collection
    (log/infof "Moving Collection %s and its descendants from %s to %s"
               (u/the-id collection) (:location collection) new-location)
    (events/publish-event! :event/collection-touch {:collection-id (:id collection) :user-id api/*current-user-id*})
    (t2/with-transaction [_conn]
      (t2/update! :model/Collection (u/the-id collection)
                  {:location new-location
                   :is_remote_synced (boolean will-be-in-remote-synced?)})
      ;; we need to update all the descendant collections as well...
      (u/prog1 (t2/query-one
                {:update :collection
                 :set {:location [:replace :location orig-children-location new-children-location]
                       :is_remote_synced (boolean will-be-in-remote-synced?)}
                 :where [:like :location (str orig-children-location "%")]})
        (when into-remote-synced?
          (check-non-remote-synced-dependencies collection))
        (when (moving-from-remote-synced? (parent-id* collection) (parent-id* {:location new-location}))
          (check-remote-synced-dependents collection))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Toucan IModel & Perms Method Impls                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ----------------------------------------------------- INSERT -----------------------------------------------------

(defn- assert-not-personal-collection-for-api-key [collection]
  (when-not config/is-prod?
    (when-let [user-id (:personal_owner_id collection)]
      (when (= :api-key (t2/select-one-fn :type :model/User user-id))
        (throw (ex-info "Can't create a personal collection for an API key" {:user user-id}))))))

(t2/define-before-insert :model/Collection
  [{collection-name :name :keys [type] :as collection}]
  (assert-valid-location collection)
  (assert-not-personal-collection-for-api-key collection)
  (assert-valid-namespace (merge {:namespace nil} collection))
  (check-allowed-content (:type collection) (when-let [location (:location (t2/changes collection))] (location-path->parent-id location)))
  (u/prog1 (-> collection
               (assoc :slug (slugify collection-name))
               (cond->
                (= type "remote-synced") (-> (assoc :is_remote_synced true) (dissoc :type))))
    (assert-valid-remote-synced-parent <>)))

(defn- copy-collection-permissions!
  "Grant read permissions to destination Collections for every Group with read permissions for a source Collection,
  and write perms for every Group with write perms for the source Collection."
  [source-collection-or-id dest-collections-or-ids]
  ;; figure out who has permissions for the source Collection...
  (let [group-ids-with-read-perms  (t2/select-fn-set :group_id :model/Permissions
                                                     :object (perms/collection-read-path source-collection-or-id))
        group-ids-with-write-perms (t2/select-fn-set :group_id :model/Permissions
                                                     :object (perms/collection-readwrite-path source-collection-or-id))]
    ;; ...and insert corresponding rows for each destination Collection
    (t2/insert! :model/Permissions
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
                   {:group_id group-id, :object readwrite-path})))
    ;; update the perms graph revision number so that editors of the permissions graph are forced to be aware
    ;; of the new permissions/collections.
    (perms/increment-implicit-perms-revision! :model/CollectionPermissionGraphRevision
                                              "Automatically updated permissions due to collection creation or move")))

(defn- copy-parent-permissions!
  "When creating a new Collection, we shall copy the Permissions entries for its parent. That way, Groups who can see
  its parent can see it; and Groups who can 'curate' (write) its parent can 'curate' it, as a default state. (Of
  course, admins can change these permissions after the fact.)

  This does *not* apply to Collections that are created inside a Personal Collection or one of its descendants.
  Descendants of Personal Collections, like Personal Collections themselves, cannot have permissions entries in the
  application database.

  This also does *not* apply to Tenant Collections or their descendants. Like Personal Collections, they
  cannot have permissions entries in the application database.

  For newly created Collections at the root-level, copy the existing permissions for the Root Collection."
  [{:keys [location id], collection-namespace :namespace, :as collection}]
  (when-not (or (is-personal-collection-or-descendant-of-one? collection)
                (is-dedicated-tenant-collection-or-descendant? collection)
                (is-trash-or-descendant? collection))
    (let [parent-collection-id (location-path->parent-id location)]
      (copy-collection-permissions! (or parent-collection-id (assoc root-collection :namespace collection-namespace))
                                    [id]))))

(t2/define-after-insert :model/Collection
  [collection]
  (u/prog1 (t2.realize/realize collection)
    (copy-parent-permissions! <>)))

;;; ----------------------------------------------------- UPDATE -----------------------------------------------------

(mu/defn- check-changes-allowed-for-protected-collection
  "If we're trying to UPDATE a Personal Collection or Tenant Collection, make sure the proposed changes are
  allowed. Personal Collections and TCs have lots of restrictions -- you can't archive them, for example, nor can you
  transfer them to other Users."
  [collection-before-updates :- CollectionWithLocationAndIDOrRoot
   collection-updates        :- :map]
  ;; you're not allowed to change the `:personal_owner_id` of a Collection!
  ;; double-check and make sure it's not just the existing value getting passed back in for whatever reason
  (let [ctype        (if (:personal_owner_id collection-before-updates)
                       "Personal Collection"
                       "Tenant Collection")
        unchangeable {:personal_owner_id (tru "You are not allowed to change the owner of a {0}." ctype)
                      :authority_level   (tru "You are not allowed to change the authority level of a {0}." ctype)
                      ;; The checks below should be redundant because the `perms-for-moving` and `perms-for-archiving`
                      ;; functions also check to make sure you're not operating on Personal Collections. But as an extra safety net it
                      ;; doesn't hurt to check here too.
                      :location          (tru "You are not allowed to move a {0}." ctype)
                      :archived          (tru "You cannot archive a {0}." ctype)}]
    (when-let [[k msg] (->> unchangeable
                            (filter (fn [[k _msg]]
                                      (api/column-will-change? k collection-before-updates collection-updates)))
                            first)]
      (throw
       (ex-info msg {:status-code 400 :errors {k msg}})))))

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

(mu/defn- grant-perms-when-moving-out-of-personal-collection!
  "When moving a descendant of a Personal Collection into the Root Collection, or some other Collection not descended
  from a Personal Collection, we need to grant it Permissions, since now that it has moved across the boundary into
  impersonal-land it *requires* Permissions to be seen or 'curated'. If we did not grant Permissions when moving, it
  would immediately become invisible to all save admins, because no Group would have perms for it. This is obviously a
  bad experience -- we do not want a User to move a Collection that they have read/write perms for (by definition) to
  somewhere else and lose all access for it."
  [collection :- (ms/InstanceOf :model/Collection) new-location :- LocationPath]
  (copy-collection-permissions! (parent {:location new-location}) (cons collection (descendants collection))))

(mu/defn- revoke-perms-when-moving-into-personal-collection!
  "When moving a `collection` that is *not* a descendant of a Personal Collection into a Personal Collection or one of
  its descendants (moving across the boundary in the other direction), any previous Group Permissions entries for it
  need to be deleted, so other users cannot access this newly-Personal Collection.

  This needs to be done recursively for all descendants as well."
  [collection :- (ms/InstanceOf :model/Collection)]
  (t2/query-one {:delete-from :permissions
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

(defenterprise update-perms-for-tenant-specific-namespace-change!
  "If a Collection is moving into or out of the tenant-specific namespace, adjust the Permissions for it accordingly.

  OSS version: Throws an exception if a collection attempts to cross the tenant-specific namespace boundary, as this
  should never happen in OSS and we want to maintain the invariant that tenant-specific collections have no
  permissions entries."
  metabase-enterprise.tenants.permissions
  [collection-before-updates collection-updates]
  ;; Check if the collection is moving across the tenant-specific namespace boundary
  (let [is-tenant-specific?      (is-dedicated-tenant-collection-or-descendant? collection-before-updates)
        will-be-tenant-specific? (is-dedicated-tenant-collection-or-descendant? (merge collection-before-updates
                                                                                       collection-updates))]
    (when (not= is-tenant-specific? will-be-tenant-specific?)
      (throw (ex-info (tru "Cannot move collections across tenant-specific namespace boundary in OSS.")
                      {:status-code 400
                       :collection collection-before-updates
                       :is-tenant-specific is-tenant-specific?
                       :will-be-tenant-specific will-be-tenant-specific?})))))

;; PUTTING IT ALL TOGETHER <3

(defn- namespace-equals?
  "Returns true if the :namespace values (for a collection) are equal between multiple instances. Either one can be a
  string or keyword.

  This is necessary because on select, the :namespace value becomes a keyword (and hence, is a keyword in `pre-update`,
  but when passing an entity to update, it must be given as a string, not a keyword, because otherwise HoneySQL will
  attempt to quote it as a column name instead of a string value (and the update statement will fail)."
  [& namespaces]
  (let [std-fn (fn [v]
                 (if (keyword? v) (name v) (str v)))]
    (apply = (map std-fn namespaces))))

(t2/define-before-update :model/Collection
  [{:keys [type] :as collection}]
  (let [collection-before-updates (t2/instance :model/Collection (t2/original collection))
        {collection-name :name
         :as collection-updates}  (or (t2/changes collection) {})]
    (api/check
     (not (is-trash? collection-before-updates))
     [400 "You cannot modify the Trash Collection."])
    ;; VARIOUS CHECKS BEFORE DOING ANYTHING:
    ;; (1) if this is a personal Collection, check that the 'propsed' changes are allowed
    (when (or (:personal_owner_id collection-before-updates)
              (= (:type collection-before-updates) "tenant-specific-collection"))
      (check-changes-allowed-for-protected-collection collection-before-updates collection-updates))
    ;; (2) make sure the location is valid if we're changing it
    (assert-valid-location collection-updates)
    ;; (3) make sure Collection namespace is valid
    (when (contains? collection-updates :namespace)
      (when-not (namespace-equals? (:namespace collection-before-updates) (:namespace collection-updates))
        (let [msg (tru "You cannot move a Collection to a different namespace once it has been created.")]
          (throw (ex-info msg {:status-code 400, :errors {:namespace msg}})))))
    (assert-valid-namespace (merge (select-keys collection-before-updates [:namespace]) collection-updates))

    ;; (3.6) Check that the parent collection allows this collection to be there
    (check-allowed-content (:type collection) (when-let [location (:location collection)] (location-path->parent-id location)))
    ;; (3.7) Check if it's a semantic-library collection that can't be updated
    (check-library-update collection)
    ;; (4) If we're moving a Collection from a location on a Personal Collection hierarchy to a location not on one,
    ;; or vice versa, we need to grant/revoke permissions as appropriate (see above for more details)
    (when (api/column-will-change? :location collection-before-updates collection-updates)
      (update-perms-when-moving-across-personal-boundry! collection-before-updates collection-updates)
      ;; (4.5) If we're moving a Collection across the tenant-specific namespace boundary, we need to adjust
      ;; permissions accordingly (delete when moving in, grant when moving out)
      (update-perms-for-tenant-specific-namespace-change! collection-before-updates collection-updates))
    ;; OK, AT THIS POINT THE CHANGES ARE VALIDATED. NOW START ISSUING UPDATES
    ;; slugify the collection name in case it's changed in the output; the results of this will get passed along
    ;; to Toucan's `update!` impl
    (u/prog1 (cond-> collection-updates
               (= type "remote-synced") (-> (assoc :is_remote_synced true) (dissoc :type))
               collection-name (assoc :slug (slugify collection-name)))
      (when-not *clearing-remote-sync*
        (assert-valid-remote-synced-parent (merge collection-before-updates <>))))))

;;; ----------------------------------------------------- DELETE -----------------------------------------------------

(defonce ^:dynamic ^{:doc "Whether to allow deleting Personal Collections. Normally we should *never* allow this, but
  in the single case of deleting a User themselves, we need to allow this. (Note that in normal usage, Users never get
  deleted, but rather archived; thus this code is used solely by our test suite, by things such as the `with-temp`
  macros.)"}
  *allow-deleting-personal-collections*
  false)

(t2/define-before-delete :model/Collection
  [collection]
  ;; This should never happen, but just to make sure...
  (when (= (u/the-id collection) (trash-collection-id))
    (throw (ex-info "Fatal error: the trash collection cannot be trashed" {})))
  ;; delete all collection children
  (t2/delete! :model/Collection :location (children-location collection))
  (let [affected-collection-ids (cons (u/the-id collection) (collection->descendant-ids collection))]
    (t2/update! :model/Table :collection_id [:in affected-collection-ids] {:collection_id nil
                                                                           :is_published  false})
    (doseq [model [:model/Card
                   :model/Dashboard
                   :model/NativeQuerySnippet
                   :model/Pulse
                   :model/Timeline]]
      (t2/delete! model :collection_id [:in affected-collection-ids])))

  ;; You can't delete a Personal Collection! Unless we enable it because we are simultaneously deleting the User
  (when-not *allow-deleting-personal-collections*
    (when (:personal_owner_id collection)
      (throw (Exception. (tru "You cannot delete a Personal Collection!")))))
  ;; Delete permissions records for this Collection
  (t2/query-one {:delete-from :permissions
                 :where       [:or
                               [:= :object (perms/collection-readwrite-path collection)]
                               [:= :object (perms/collection-read-path collection)]]}))

;;; -------------------------------------------------- IModel Impl ---------------------------------------------------

;;; Return the required set of permissions to `read-or-write` `collection-or-id`.
(defmethod mi/perms-objects-set :model/Collection
  [collection-or-id read-or-write]
  (let [collection (if (integer? collection-or-id)
                     (t2/select-one [:model/Collection :id :namespace] :id (collection-or-id))
                     collection-or-id)]
    (if (and (= (u/qualified-name (:namespace collection)) "snippets")
             (not (premium-features/enable-snippet-collections?)))
      #{}
      ;; This is not entirely accurate as you need to be a superuser to modify a collection itself (e.g., changing its
      ;; name) but if you have write perms you can add/remove cards
      #{(case read-or-write
          :read  (perms/collection-read-path collection-or-id)
          :write (perms/collection-readwrite-path collection-or-id))})))

(def instance-analytics-collection-type
  "The value of the `:type` field for the `instance-analytics` Collection created in [[metabase-enterprise.audit-app.audit]]"
  "instance-analytics")

(defmethod mi/exclude-internal-content-hsql :model/Collection
  [_model & {:keys [table-alias]}]
  (let [maybe-alias #(h2x/identifier :field (some-> table-alias name) %)]
    [:and
     [:or [:= (maybe-alias :type) nil]
      [:and
       [:not= (maybe-alias :type) [:inline instance-analytics-collection-type]]
       [:not= (maybe-alias :type) [:inline trash-collection-type]]]]
     [:or [:= (maybe-alias :namespace) nil]
      [:not= (maybe-alias :namespace) [:inline "analytics"]]]
     [:not (maybe-alias :is_sample)]]))

(defn- parent-identity-hash [coll]
  (let [parent-id (-> coll
                      (t2/hydrate :parent_id)
                      :parent_id)
        parent    (when parent-id (t2/select-one :model/Collection :id parent-id))]
    (cond
      (not parent-id) "ROOT"
      (not parent)    (throw (ex-info (format "Collection %s is an orphan" (:id coll)) {:parent-id parent-id}))
      :else           (serdes/identity-hash parent))))

(defmethod serdes/hash-fields :model/Collection
  [_collection]
  [:name :namespace parent-identity-hash :created_at])

(defmethod serdes/extract-query "Collection" [_model {:keys [collection-set where skip-archived]}]
  (let [not-trash-clause [:or
                          [:= :type nil]
                          [:not= :type trash-collection-type]]]
    (if (seq collection-set)
      (t2/reducible-select :model/Collection
                           {:where
                            [:and
                             (when skip-archived [:not :archived])
                             [:or
                              [:in :id collection-set]
                              (when (some nil? collection-set) [:= :id nil])]
                             not-trash-clause
                             (or where true)]})
      (t2/reducible-select :model/Collection
                           {:where
                            [:and
                             (when skip-archived [:not :archived])
                             [:= :personal_owner_id nil]
                             not-trash-clause
                             (or where true)]}))))

(defmethod serdes/dependencies "Collection"
  [{:keys [parent_id]}]
  (when parent_id
    #{[{:model "Collection" :id parent_id}]}))

(defmethod serdes/generate-path "Collection" [_ coll]
  (serdes/maybe-labeled "Collection" coll :slug))

(defmethod serdes/required "Collection" [_ id]
  (when id
    (let [{:keys [location]} (t2/select-one :model/Collection :id id)
          path               (location-path->ids location)]
      ;; we'll recurse anyway, so just return immediate parent
      (when (seq path)
        {["Collection" (u/last path)] {"Collection" id}}))))

(defmethod serdes/descendants "Collection" [_model-name id {:keys [skip-archived]}]
  (let [location    (when id (t2/select-one-fn :location :model/Collection :id id))
        child-colls (when id ; traversing root coll will return all (even personal) colls, do not do it
                      (into {} (for [child-id (t2/select-pks-set :model/Collection
                                                                 {:where [:and
                                                                          [:= :location (str location id "/")]
                                                                          (when skip-archived [:not :archived])
                                                                          [:or
                                                                           [:not= :type trash-collection-type]
                                                                           [:= :type nil]]]})]
                                 {["Collection" child-id] {"Collection" id}})))
        dashboards  (into {} (for [dash-id (t2/select-pks-set :model/Dashboard {:where [:and
                                                                                        [:= :collection_id id]
                                                                                        (when skip-archived [:not :archived])]})]
                               {["Dashboard" dash-id] {"Collection" id}}))
        cards       (into {} (for [card-id (t2/select-pks-set :model/Card {:where [:and
                                                                                   [:= :collection_id id]
                                                                                   (when skip-archived [:not :archived])]})]
                               {["Card" card-id] {"Collection" id}}))
        documents (when config/ee-available?
                    (into {} (for [doc-id (t2/select-pks-set :model/Document {:where
                                                                              [:and [:= :collection_id id]
                                                                               (when skip-archived [:not :archived])]})]
                               {["Document" doc-id] {"Collection" id}})))
        timelines   (into {} (for [timeline-id (t2/select-pks-set :model/Timeline {:where [:and
                                                                                           [:= :collection_id id]
                                                                                           (when skip-archived [:not :archived])]})]
                               {["Timeline" timeline-id] {"Collection" id}}))
        tables      (into {} (for [table-id (t2/select-pks-set :model/Table {:where [:and
                                                                                     [:= :collection_id id]
                                                                                     [:= :is_published true]
                                                                                     (when skip-archived [:= :archived_at nil])]})]
                               {["Table" table-id] {"Collection" id}}))
        ;; Transforms don't have an archived column, so we don't filter by skip-archived
        transforms  (when config/ee-available?
                      (into {} (for [transform-id (t2/select-pks-set :model/Transform {:where [:= :collection_id id]})]
                                 {["Transform" transform-id] {"Collection" id}})))]
    (merge child-colls dashboards cards documents timelines tables transforms)))

(defmethod serdes/storage-path "Collection" [coll {:keys [collections]}]
  (let [parental (get collections (:entity_id coll))]
    (concat ["collections"] parental [(last parental)])))

(defn- parent-id->location-path [parent-id]
  (if-not parent-id
    "/"
    ;; It would be great to use a cache rather than a database call to fetch the parent.
    (let [{:keys [id location]} (t2/select-one :model/Collection parent-id)]
      (str location id "/"))))

(defmethod serdes/make-spec "Collection" [_model-name _opts]
  {:copy [:archive_operation_id
          :archived
          :archived_directly
          :authority_level
          :description
          :entity_id
          :is_remote_synced
          :is_sample
          :name
          :namespace
          :slug
          :type]
   :skip []
   :transform {:created_at        (serdes/date)
               ;; We only dump the parent id, and recalculate the location from that on load.
               :location          (serdes/as :parent_id
                                             (serdes/compose
                                              (serdes/fk :model/Collection)
                                              {:export location-path->parent-id
                                               :import parent-id->location-path}))
               :personal_owner_id (serdes/fk :model/User)
               :workspace_id      (serdes/fk :model/Workspace)}})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Perms Checking Helper Fns                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn check-allowed-to-change-collection
  "If we're changing the `collection_id` of an object, make sure we have write permissions for both the old and new
  Collections, or throw a 403 if not. If `collection_id` isn't present in `object-updates`, or the value is the same
  as the original, this check is a no-op.

  As usual, an `collection-id` of `nil` represents the Root Collection.


  Intended for use with `PUT` or `PATCH`-style operations. Usage should look something like:

    ;; `object-before-update` is the object as it currently exists in the application DB
    ;; `object-updates` is a map of updated values for the object
    (check-allowed-to-change-collection (t2/select-one Card :id 100) http-request-body)"
  [object-before-update object-updates]
  ;; if collection_id is set to change...
  (when (api/column-will-change? :collection_id object-before-update object-updates)
    ;; check that we're allowed to modify the old Collection
    (if-let [coll-id (:collection_id object-before-update)]
      (api/write-check :model/Collection coll-id)
      (api/write-check root-collection))
    ;; check that we're allowed to modify the new Collection
    (if-let [coll-id (:collection_id object-updates)]
      (api/write-check :model/Collection coll-id)
      (api/write-check root-collection))
    ;; check that the new location is not archived. the root can't be archived.
    (when-let [collection-id (:collection_id object-updates)]
      (api/check-400 (t2/exists? :model/Collection :id collection-id :archived false)))))

(defmulti allowed-namespaces
  "Set of Collection namespaces (as keywords) that instances of this model are allowed to go in. By default, only the
  default namespace (namespace = `nil`)."
  {:arglists '([model])}
  t2.protocols/dispatch-value)

(defmethod allowed-namespaces :default
  [_]
  #{nil :analytics :shared-tenant-collection :tenant-specific})

(defn check-collection-namespace
  "Check that object's `:collection_id` refers to a Collection in an allowed namespace (see
  `allowed-namespaces`), or throw an Exception.

    ;; Cards can only go in Collections in the default namespace (namespace = nil)
    (check-collection-namespace Card new-collection-id)"
  [model collection-id]
  (when collection-id
    (let [collection           (or (t2/select-one [:model/Collection :namespace] :id collection-id)
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

(defn annotate-collections
  "Annotate collections with `:below` and `:here` keys to indicate which types are in their subtree and which types are
  in the collection at that level.

  The second argument is the list of collections to annotate.

  The first argument to this function could use a bit of explanation: `child-type->parent-ids` is a map. Keys are
  object types (e.g. `:collection`), values are sets of collection IDs that are the (direct) parents of one or more
  objects of that type."
  [child-type->parent-ids collections]
  (let [child-type->ancestor-ids
        (reduce (fn [m {:keys [location id] :as _collection}]
                  (let [parent-ids (set (location-path->ids location))]
                    (reduce (fn [m [t id-set]]
                              (cond-> m
                                (contains? id-set id) (update t set/union parent-ids)))
                            m
                            child-type->parent-ids)))
                (zipmap (keys child-type->parent-ids) (repeat #{}))
                collections)

        collect-present-child-types
        (fn [child-type-map id]
          (persistent!
           (reduce-kv (fn [acc child-type coll-id-set]
                        (cond-> acc
                          (contains? coll-id-set id) (conj! child-type)))
                      (transient #{})
                      child-type-map)))]
    (mapv (fn [{:keys [id] :as collection}]
            (let [below (collect-present-child-types child-type->ancestor-ids id)
                  here (collect-present-child-types child-type->parent-ids id)]
              (cond-> collection
                (seq below) (assoc :below below)
                (seq here) (assoc :here here))))
          collections)))

(defn collections->tree
  "Convert a flat sequence of Collections into a tree structure e.g.

    (collections->tree {:dataset #{C D} :card #{F C} [A B C D E F G])
    ;; ->
    [{:name     \"A\"
      :below    #{:card :dataset}
      :children [{:name \"B\"}
                 {:name     \"C\"
                  :here     #{:dataset :card}
                  :below    #{:dataset :card}
                  :children [{:name     \"D\"
                              :here     #{:dataset}
                              :children [{:name \"E\"}]}
                             {:name     \"F\"
                              :here     #{:card}
                              :children [{:name \"G\"}]}]}]}
     {:name \"H\"}]"
  [child-type->parent-ids collections]
  (let [;; instead of attempting to re-sort like the database does, keep things consistent by just keeping things in
        ;; the same order they're already in.
        original-position (into {} (map-indexed (fn [i {id :id}]
                                                  [id i]) collections))
        all-visible-ids (set (map :id collections))]
    (transduce
     identity
     (fn ->tree
       ;; 1. We'll use a map representation to start off with to make building the tree easier. Keyed by Collection ID
       ;; e.g.
       ;;
       ;; {1 {:name "A"
       ;;     :children {2 {:name "B"}, ...}}}
       ([] {})
       ;; 2. For each as we come across it, put it in the correct location in the tree. Convert it's `:location` (e.g.
       ;; `/1/`) plus its ID to a key path e.g. `[1 :children 2]`
       ;;
       ;; If any ancestor Collections are not present in `collections`, just remove their IDs from the path,
       ;; effectively "pulling" a Collection up to a higher level. e.g. if we have A > B > C and we can't see B then
       ;; the tree should come back as A > C.
       ([m collection]
        (let [ids (location-path->ids (:location collection))
              path (if (empty? ids)
                     [(:id collection)]
                     (as-> ids ids
                       (filterv all-visible-ids ids)
                       (conj ids (:id collection))
                       (interpose :children ids)
                       (vec ids)))]
          ;; Using conj instead of merge because the latter is inefficient with its varargs and reduce1.
          (update-in m path #(if %1 (conj %1 %2) %2) collection)))
       ;; 3. Once we've build the entire tree structure, go in and convert each ID->Collection map into a flat sequence,
       ;; sorted by the lowercased Collection name. Do this recursively for the `:children` of each Collection e.g.
       ;;
       ;; {1 {:name "A"
       ;;     :children {2 {:name "B"}, ...}}}
       ;; ->
       ;; [{:name "A"
       ;;   :children [{:name "B"}, ...]}]
       ([m]
        (->> (vals m)
             (map #(update % :children ->tree))
             (sort-by (fn [{coll-id :id}]
                        ;; coll-type is `nil` or "instance-analytics"
                        ;; nil sorts first, so we get instance-analytics at the end, which is what we want
                        (original-position coll-id))))))
     (annotate-collections child-type->parent-ids collections))))

(defmulti hydrate-can-restore
  "Can these items be restored?"
  {:arglists '([model items])}
  (fn [model _] model))

(defmethod hydrate-can-restore :model/Collection [_model colls]
  (when (seq colls)
    (let [archived-colls (filter :archived colls)
          ;; Batch: get parent info
          coll-id->parent-id (into {} (map (fn [{:keys [id parent_id]}] [id parent_id])
                                           (t2/hydrate archived-colls :parent_id)))
          parent-ids (keep val coll-id->parent-id)
          parent-id->archived? (when (seq parent-ids)
                                 (t2/select-pk->fn :archived :model/Collection :id [:in parent-ids]))
          ;; Batch: get all descendants for all archive_operation_ids
          op-ids (keep :archive_operation_id archived-colls)
          all-descendants (when (seq op-ids)
                            (t2/select :model/Collection
                                       :archive_operation_id [:in op-ids]
                                       :archived true))
          op-id->descendant-ids (update-vals (group-by :archive_operation_id all-descendants)
                                             #(map :id %))]
      (for [coll colls
            :let [parent-id (coll-id->parent-id (:id coll))
                  archived-directly? (:archived_directly coll)
                  parent-archived? (get parent-id->archived? parent-id false)
                  descendant-ids (get op-id->descendant-ids (:archive_operation_id coll) [])
                  perm-paths (set (cons (perms/collection-readwrite-path coll)
                                        (map perms/collection-readwrite-path descendant-ids)))]]
        (assoc coll :can_restore (boolean (and (:archived coll)
                                               archived-directly?
                                               (not parent-archived?)
                                               (perms/set-has-full-permissions-for-set?
                                                @api/*current-user-permissions-set*
                                                perm-paths))))))))

(defmethod hydrate-can-restore :default [_model items]
  (for [[{collection :collection} item] (map vector (t2/hydrate items :collection) items)]
    (assoc item :can_restore (boolean
                              (and
                               ;; the item is archived
                               (:archived item)

                               ;; the item is directly in the trash (it was archived independently, not as
                               ;; part of a collection)
                               (:archived_directly item)

                               ;; EITHER:
                               (or
                                ;; the item was archived from the root collection
                                (nil? (:collection_id item))
                                ;; or the collection we'll restore to actually exists.
                                (some? collection))

                               ;; the collection we'll restore to is not archived
                               (not (:archived collection))

                               ;; we have perms on the collection
                               (mi/can-write? (or collection root-collection)))))))

(mi/define-batched-hydration-method can-restore
  :can_restore
  "Efficiently hydrate the `:can_restore` of a sequence of items with a `archived_directly` field."
  [items]
  (->> (map-indexed (fn [i item] (vary-meta item assoc ::i i)) items)
       (group-by t2/model)
       (mapcat (fn [[model items]]
                 (hydrate-can-restore model items)))
       (sort-by (comp ::i meta))))

(mi/define-batched-hydration-method can-delete
  :can_delete
  "Efficiently hydrate the `:can_delete` of a sequence of items"
  [items]
  (when (seq items)
    (for [item items]
      (assoc item :can_delete (boolean (and
                                        (not (collection.root/is-root-collection? item))
                                        (or (not (= :model/Collection (t2/model item)))
                                            api/*is-superuser?*)
                                        (:archived item)
                                        (mi/can-write? item)))))))

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search.spec/define-spec "collection"
  {:model        :model/Collection
   :attrs        {:collection-id :id
                  :creator-id    false
                  :database-id   false
                  :archived      true
                  :created-at    true
                  ;; intentionally not tracked
                  :updated-at    false}
   :search-terms [:name]
   :render-terms {:archived-directly          true
                  ;; Why not make this a search term? I suspect it was just overlooked before.
                  :description                true
                  :collection_authority_level :authority_level
                  :collection_name            :name
                  :collection_type            :type
                  :location                   true}
   :where [:or [:= :namespace nil]
           [:= :namespace "analytics"]
           [:= :namespace "shared-tenant-collection"]
           [:= :namespace "tenant-specific"]]
   ;; depends on the current user, used for rendering and ranking
   ;; TODO not sure this is what it'll look like
   :bookmark     [:model/CollectionBookmark [:and
                                             [:= :bookmark.collection_id :this.id]
                                             ;; a magical alias, or perhaps this clause can be implicit
                                             [:= :bookmark.user_id :current_user/id]]]})

(defn is-library-collection?
  "Return true if the given collection ID corresponds to a collection in the library."
  [collection-id]
  (when collection-id
    (pos-int? (t2/count :model/Collection :id collection-id :type [:in [library-collection-type
                                                                        library-data-collection-type
                                                                        library-metrics-collection-type]]))))

(defn collections-in-namespace
  "Return all collections in the given namespace."
  [namespace]
  (t2/select :model/Collection :namespace (name namespace)))
