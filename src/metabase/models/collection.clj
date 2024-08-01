(ns metabase.models.collection
  "Collections are used to organize Cards, Dashboards, and Pulses; as of v0.30, they are the primary way we determine
  permissions for these objects.
  `metabase.models.collection.graph`. `metabase.models.collection.graph`"
  (:refer-clojure :exclude [ancestors descendants])
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.common
    :as api
    :refer [*current-user-id* *current-user-permissions-set*]]
   [metabase.audit :as audit]
   [metabase.config :refer [*request-id*]]
   [metabase.db :as mdb]
   [metabase.events :as events]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms :refer [Permissions]]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.util :as perms.u]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs tru]]
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
  "Schema for things that are instances of [[metabase.models.collection.root.RootCollection]]."
  [:fn
   {:error/message (str "an instance of the root Collection")}
   #'collection.root/is-root-collection?])

(def ^:private ^:const archived-directly-models #{:model/Card :model/Dashboard})
(def ^:private ^:const collectable-models
  (set/union archived-directly-models
             #{:model/Pulse :model/NativeQuerySnippet :model/Timeline}))

(def ^:private ^:const collection-slug-max-length
  "Maximum number of characters allowed in a Collection `slug`."
  510)

(def ^:constant trash-collection-type
  "The value of the `:type` field for the Trash collection that holds archived items."
  "trash")

(defn- trash-collection* []
  (t2/select-one :model/Collection :type trash-collection-type))

(def ^{:arglists '([])} trash-collection
  "Memoized copy of the Trash collection from the DB."
  (mdb/memoize-for-application-db
   (fn []
     (u/prog1 (trash-collection*)
       (when-not <>
         (throw (ex-info "Fatal error: Trash collection is missing" {})))))))

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
  (or (= (:type collection-or-id) trash-collection-type)
      (some-> collection-or-id u/id (= (trash-collection-id)))))

(defn is-trash-or-descendant?
  "Is this the trash collection, or a descendant of it?"
  [collection]
  (str/starts-with? (:location collection) (trash-path)))

(def Collection
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], no2 it's a reference to the toucan2 model name.
  We'll keep this till we replace all the Card symbol in our codebase."
  :model/Collection)

(methodical/defmethod t2/table-name :model/Collection [_model] :collection)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :collection]
  [_original-model _k]
  :model/Collection)

(t2/deftransforms :model/Collection
  {:namespace       mi/transform-keyword
   :authority_level mi/transform-keyword})

(defn maybe-localize-trash-name
  "If the collection is the Trash, translate the `name`. This is a public function because we can't rely on
  `define-after-select` in all circumstances, e.g. when searching or listing collection items (where we do a direct DB
  query without `:model/Collection`)."
  [collection]
  (cond-> collection
    (is-trash? collection) (assoc :name (tru "Trash"))))

(t2/define-after-select :model/Collection [collection]
  (maybe-localize-trash-name collection))

(doto Collection
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

(defn- default-audit-collection?
  [{:keys [id] :as _col}]
  (= id (:id (audit/default-audit-collection))))

(defmethod mi/can-write? Collection
  ([instance]
   (and (not (default-audit-collection? instance))
        (mi/current-user-has-full-permissions? :write instance)))
  ([_model pk]
   (mi/can-write? (t2/select-one :model/Collection pk))))

(defmethod mi/can-read? Collection
  ([instance]
   (perms/can-read-audit-helper :model/Collection instance))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Collection :id pk))))

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
  (for [^String id-str (rest (str/split location-path #"/"))]
    (Integer/parseInt id-str)))

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
  "Given a `location-path` fetch the ID of the direct of a Collection.

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
        (t2/count Collection :id [:in ids])))))

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
  (when location
    (when-let [parent-id (location-path->parent-id location)]
      (let [parent-namespace (t2/select-one-fn :namespace Collection :id parent-id)]
        (when-not (= (keyword collection-namespace) (keyword parent-namespace))
          (let [msg (tru "Collection must be in the same namespace as its parent")]
            (throw (ex-info msg {:status-code 400, :errors {:location msg}})))))))
  ;; non-default namespace Collections cannot be personal Collections
  (when (and owner-id collection-namespace)
    (let [msg (tru "Personal Collections must be in the default namespace")]
      (throw (ex-info msg {:status-code 400, :errors {:personal_owner_id msg}})))))

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
    (t2/select-one Collection :id new-parent-id)
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

(def ^:private VisibleCollections
  "Includes the possible values for visible collections, possibly including `\"root\"` to represent the root
  collection."
  [:set
   [:or [:= "root"] ms/PositiveInt]])

(def ^:private ^{:arglists '([])} collection-id->collection
  "Cached function to fetch *all* collections, as a map of, well, `collection-id->collection`."
  (memoize/ttl
   ^{::memoize/args-fn (fn [& _]
                         ;; If this is running in the context of a request, cache it for the duration of that request.
                         ;; Otherwise, don't cache the results at all.)
                         (if-let [req-id *request-id*]
                           [req-id]
                           [(random-uuid)]))}
   (fn collection-id->collection*
     []
     (into {} (t2/select-fn-vec (juxt :id identity) :model/Collection)))
   ;; cache the results for 10 seconds. This is a bit arbitrary but should be long enough to cover ~all requests.
   :ttl/threshold (* 10 1000)))

(defn- permissions-set->collection-id->collection
  [permissions-set & [read-or-write]]
  (let [collection-id->collection (collection-id->collection)
        ids-with-perm (set
                       (for [path  permissions-set
                             :let  [[_ id-str] (case read-or-write
                                                 :read
                                                 (re-matches #"/collection/((?:\d+)|root)/(read/)?" path)

                                                 :write
                                                 (re-matches #"/collection/((?:\d+)|root)/" path))]
                             :when id-str]
                         (cond-> id-str
                           (not= id-str "root") Integer/parseInt)))
        has-root-permission? (or (contains? permissions-set "/") (contains? ids-with-perm "root"))
        root-map (when has-root-permission?
                   {"root" collection.root/root-collection})
        has-permission? (fn [[id _]]
                          (if (contains? permissions-set "/")
                            true
                            (contains? ids-with-perm id)))]
    (->> collection-id->collection
         (filter has-permission?)
         (merge root-map))))

(def ^:private CollectionVisibilityConfig
  [:map
   [:include-trash-collection? {:optional true} :boolean]
   [:include-archived-items {:optional true} [:enum :only :exclude :all]]
   [:archive-operation-id {:optional true} [:maybe :string]]
   [:permission-level {:optional true} [:enum :read :write]]])

(defn- should-remove-for-archived? [include-archived-items collection]
  (case include-archived-items
    :all false
    :exclude (:archived collection)
    :only (not (or (:archived collection)
                   (is-trash? collection)))))

(defn- should-remove-for-trash? [include-trash-collection? collection]
  (if include-trash-collection?
    false
    (is-trash? collection)))

(defn- should-remove-for-archive-operation-id [archive-operation-id collection]
  (and (some? archive-operation-id)
       (not= archive-operation-id (:archive_operation_id collection))))

(mu/defn permissions-set->visible-collection-ids :- VisibleCollections
  "There are four knobs we need to take into account when turning the permissions set into visible collection IDs.
  - permission-level: generally collections with `read` permission are visible. Sometimes we want to change this and only
    view collections with `write` permissions.
  - include-archived-items: are archived collections currently visible, or not?
  - archive-operation-id: when looking at a archived collection, we want to restrict visible collections to those that share
  that operation ID.
  - include-trash-collection?: is the Trash Collection itself visible, or not? Sometimes we want to show the Trash but
    not the archived items inside it."
  ([permissions-set :- [:set :string]]
   (permissions-set->visible-collection-ids permissions-set {}))
  ([permissions-set :- [:set :string]
    visibility-config :- CollectionVisibilityConfig]
   (let [visibility-config (merge {:include-archived-items :exclude
                                   :include-trash-collection? false
                                   :archive-operation-id nil
                                   :permission-level :read}
                                  visibility-config)]
     (->> (permissions-set->collection-id->collection permissions-set (:permission-level visibility-config))
          (remove #(should-remove-for-archived? (:include-archived-items visibility-config) (val %)))
          (remove #(should-remove-for-archive-operation-id (:archive-operation-id visibility-config) (val %)))
          (remove #(should-remove-for-trash? (:include-trash-collection? visibility-config) (val %)))
          (map key)
          (into #{})))))

(mu/defn visible-collection-ids->honeysql-filter-clause
  "Generate an appropriate HoneySQL `:where` clause to filter something by visible Collection IDs, such as the ones
  returned by `permissions-set->visible-collection-ids`. Correctly handles all possible values returned by that
  function, including `root` Collection IDs (for the Root Collection).

  Guaranteed to always generate a valid HoneySQL form, so this can be used directly in a query without further checks.

    (t2/select Card
      {:where (collection/visible-collection-ids->honeysql-filter-clause
               (collection/permissions-set->visible-collection-ids
                @*current-user-permissions-set*))})"
  ([collection-ids :- VisibleCollections]
   (visible-collection-ids->honeysql-filter-clause :collection_id collection-ids))

  ([collection-id-field :- [:or [:tuple [:= :coalesce] :keyword :keyword] :keyword] ;; `[:vector :keyword]` allows `[:coalesce :option-1 :option-2]`
    collection-ids      :- VisibleCollections]
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
       false))))

(mu/defn visible-collection-ids->direct-visible-descendant-clause
  "Generates an appropriate HoneySQL `:where` clause to filter out descendants of a collection A with a specific property.
  This property is being a descendant of a visible collection other than A. Used for effective children calculations"
  [parent-collection :- CollectionWithLocationAndIDOrRoot, collection-ids :- VisibleCollections]
  (if (is-trash? parent-collection)
    ;; the only direct descendants of the Trash are those that were trashed directly. TODO: theoretically if someone
    ;; Trashes collection A, which I don't have permissions on, and then trashes collection B, which I do - I should
    ;; see collection B in the Trash. But this is not something we can figure out here, because we need to look at
    ;; whether a visible ancestor was `archived_directly`.
    [:= :archived_directly true]
    (let [parent-id (or (:id parent-collection) "")]
      (into
       ;; if the collection-ids are empty, the whole into turns into nil and we have a dangling [:and] clause in query.
       ;; the (1 = 1) is to prevent this
       [:and [:= [:inline 1] [:inline 1]]]
       (let [to-disj-ids         (location-path->ids (or (:effective_location parent-collection) "/"))
             disj-collection-ids (apply disj collection-ids (conj to-disj-ids parent-id))]
         (for [visible-collection-id disj-collection-ids]
           [:not-like :location (h2x/literal (format "%%/%s/%%" (str visible-collection-id)))]))))))

(mu/defn- effective-location-path* :- [:maybe LocationPath]
  ([collection :- CollectionWithLocationOrRoot]
   (when-not (collection.root/is-root-collection? collection)
     (effective-location-path* (if (:archived_directly collection)
                                 (trash-path)
                                 (:location collection))
                               (permissions-set->visible-collection-ids
                                @*current-user-permissions-set*
                                {:include-archived-items    (if (:archived collection)
                                                              :only
                                                              :exclude)
                                 :include-trash-collection? true
                                 :archive-operation-id      (:archive_operation_id collection)
                                 :permission-level          :read}))))
  ([real-location-path     :- LocationPath
    allowed-collection-ids :- VisibleCollections]
   (apply location-path (for [id    (location-path->ids real-location-path)
                              :when (contains? allowed-collection-ids id)]
                          id))))

(mi/define-simple-hydration-method effective-location-path
  :effective_location
  "Given a `location-path` and a set of Collection IDs one is allowed to view (obtained from
  `permissions-set->visible-collection-ids` above), calculate the 'effective' location path (excluding IDs of
  Collections for which we do not have read perms) we should show to the User.

  When called with a single argument, `collection`, this is used as a hydration function to hydrate
  `:effective_location`."
  ([collection]
   (effective-location-path* collection))
  ([real-location-path allowed-collection-ids]
   (effective-location-path* real-location-path allowed-collection-ids)))

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
  (let [collections     (map #(t2/hydrate % :effective_location) collections)
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
;;; |                          Nested Collections: Ancestors, Childrens, Child Collections                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- ancestors* :- [:maybe [:sequential (ms/InstanceOf Collection)]]
  [{:keys [location]}]
  (when-let [ancestor-ids (seq (location-path->ids location))]
    (t2/select [Collection :name :id :personal_owner_id]
      :id [:in ancestor-ids]
      {:order-by [:location]})))

(mi/define-simple-hydration-method ancestors
  :ancestors
  "Fetch ancestors (parent, grandparent, etc.) of a `collection`. These are returned in order starting with the
  highest-level (e.g. most distant) ancestor."
  [collection]
  (ancestors* collection))

(mu/defn- effective-ancestors*
  "Given a collection, return the effective ancestors of that collection.
  Note that the map `(collection-id->collection)` is cached for the lifetime
  of the request, so this will make at most one DB query per request regardless
  of how many times it is called."
  [collection :- [:maybe CollectionWithLocationOrRoot]]
  (if (or (nil? collection)
          (collection.root/is-root-collection? collection))
    []
    (some->> (effective-location-path collection)
             location-path->ids
             (map (collection-id->collection))
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
  (map (fn [collection]
         (assoc collection
                :effective_ancestors
                (effective-ancestors* collection)))
       collections))

(mu/defn- parent-id* :- [:maybe ms/PositiveInt]
  [{:keys [location]} :- CollectionWithLocationOrRoot]
  (some-> location location-path->parent-id))

(methodical/defmethod t2/simple-hydrate [:default :parent_id]
  "Get the immediate parent `collection` id, if set."
  [_model k collection]
  (assoc collection k (parent-id* collection)))

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

(def ^:private Children
  [:schema
   {:registry {::children [:and
                           (ms/InstanceOf Collection)
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

(mu/defn descendant-ids :- [:maybe [:set ms/PositiveInt]]
  "Return a set of IDs of all descendant Collections of a `collection`."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (t2/select-pks-set Collection :location [:like (str (children-location collection) \%)]))

(mu/defn- effective-children-where-clause
  [collection & additional-honeysql-where-clauses]
  (let [visible-collection-ids (permissions-set->visible-collection-ids
                                @*current-user-permissions-set*
                                {:include-archived-items    (if (or (:archived collection)
                                                                    (is-trash? collection))
                                                              :only
                                                              :exclude)
                                 :include-trash-collection? true
                                 :archive-operation-id      (:archive_operation_id collection)
                                 :permission-level          (if (or (:archived collection)
                                                                    (is-trash? collection))
                                                              :write
                                                              :read)})]
    ;; Collection B is an effective child of Collection A if...
    (into
      [:and
       ;; it is a descendant of Collection A. For the Trash, this just means the collection is archived. Otherwise
       ;; we check that Collection B's location contains A's location as a prefix
       (if (is-trash? collection)
         [:= :archived true]
         [:like :location (h2x/literal (str (children-location collection) "%"))])
       ;; when we're looking at a particular archived collection, we only see the subtree that was archived together.
       (when (:archive_operation_id collection)
         [:= :archive_operation_id (:archive_operation_id collection)])
       ;; it is visible.
       (visible-collection-ids->honeysql-filter-clause :id visible-collection-ids)
       ;; it is NOT a descendant of a visible Collection other than A - e.g. a visible subcollection.
       (visible-collection-ids->direct-visible-descendant-clause (t2/hydrate collection :effective_location) visible-collection-ids)
       ;; don't want personal collections in collection items. Only on the sidebar
       [:= :personal_owner_id nil]]
      ;; (any additional conditions)
      additional-honeysql-where-clauses)))

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
  [collection :- CollectionWithLocationAndIDOrRoot & additional-honeysql-where-clauses]
  {:select [:id :name :description]
   :from   [[:collection :col]]
   :where  (apply effective-children-where-clause collection additional-honeysql-where-clauses)})

(mu/defn- effective-children* :- [:set (ms/InstanceOf Collection)]
  [collection :- CollectionWithLocationAndIDOrRoot & additional-honeysql-where-clauses]
  (set (t2/select [Collection :id :name :description]
                  {:where (apply effective-children-where-clause collection additional-honeysql-where-clauses)})))

(mi/define-simple-hydration-method effective-children
  :effective_children
  "Get the descendant Collections of `collection` that should be presented to the current User as direct children of
  this Collection. See documentation for [[metabase.models.collection/effective-children-query]] for more details."
  [collection & additional-honeysql-where-clauses]
  (apply effective-children* collection additional-honeysql-where-clauses))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Recursive Operations: Moving & Archiving                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn perms-for-archiving :- [:set perms.u/PathSchema]
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
  ;; Make sure we're not trying to archive the Custom Reports Collection...
  (when (= (audit/default-custom-reports-collection) collection)
    (throw (Exception. (tru "You cannot archive the Custom Reports Collection."))))
  ;; also make sure we're not trying to archive a PERSONAL Collection
  (when (t2/exists? Collection :id (u/the-id collection), :personal_owner_id [:not= nil])
    (throw (Exception. (tru "You cannot archive a Personal Collection."))))
  (set
   (for [collection-or-id (cons
                           (parent collection)
                           (cons
                            collection
                            (t2/select-pks-set Collection :location [:like (str (children-location collection) "%")])))]
     (perms/collection-readwrite-path collection-or-id))))

(mu/defn perms-for-moving :- [:set perms.u/PathSchema]
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
         (perms-for-archiving collection))))

(mu/defn- collection->descendant-ids :- [:maybe [:set ms/PositiveInt]]
  [collection :- CollectionWithLocationAndIDOrRoot, & additional-conditions]
  (apply t2/select-pks-set Collection
         :location [:like (str (children-location collection) "%")]
         additional-conditions))

(mu/defn archive-collection!
  "Mark a collection as archived, along with all its children."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (api/check-403
   (perms/set-has-full-permissions-for-set?
    @api/*current-user-permissions-set*
    (perms-for-archiving collection)))
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
      (doseq [model (apply disj collectable-models archived-directly-models)]
        (t2/update! model {:collection_id [:in affected-collection-ids]}
                    {:archived true}))
      (doseq [model archived-directly-models]
        (t2/update! model {:collection_id    [:in affected-collection-ids]
                           :archived_directly false}
                    {:archived true})))))

(mu/defn unarchive-collection!
  "Mark a collection as unarchived, along with any children that were archived along with the collection."
  [collection :- CollectionWithLocationAndIDOrRoot
   ;; `updates` is a map *possibly* containing `parent_id`. This allows us to distinguish
   ;; between specifying a `nil` parent_id (move to the root) and not specifying a parent_id.
   updates :- [:map [:parent_id {:optional true} [:maybe ms/PositiveInt]]]]
  (assert (:archive_operation_id collection))
  (when (not (contains? updates :parent_id))
    (api/check-400
     (:can_restore (t2/hydrate collection :can_restore))))
  (let [archive-operation-id    (:archive_operation_id collection)
        current-parent-id       (:parent_id (t2/hydrate collection :parent_id))
        new-parent-id           (if (contains? updates :parent_id)
                                  (:parent_id updates)
                                  current-parent-id)
        new-parent              (if new-parent-id
                                  (t2/select-one :model/Collection :id new-parent-id)
                                  root-collection)
        new-location            (children-location new-parent)
        orig-children-location  (children-location collection)
        new-children-location   (children-location (assoc collection :location new-location))
        affected-collection-ids (cons (u/the-id collection)
                                      (collection->descendant-ids collection
                                                                  :archive_operation_id [:= archive-operation-id]
                                                                  :archived [:= true]))]
    (api/check-400
     (and (some? new-parent) (not (:archived new-parent))))

    (t2/with-transaction [_conn]
      (t2/update! :model/Collection (u/the-id collection)
                  {:location             new-location
                   :archive_operation_id nil
                   :archived_directly    nil
                   :archived             false})
      (t2/query-one
       {:update :collection
        :set    {:location             [:replace :location orig-children-location new-children-location]
                 :archive_operation_id nil
                 :archived_directly    nil
                 :archived             false}
        :where  [:and
                 [:like :location (str orig-children-location "%")]
                 [:= :archive_operation_id (:archive_operation_id collection)]
                 [:not= :archived_directly true]]})
      (doseq [model (apply disj collectable-models archived-directly-models)]
        (t2/update! model {:collection_id [:in affected-collection-ids]}
                    {:archived false}))
      (doseq [model archived-directly-models]
        (t2/update! model {:collection_id     [:in affected-collection-ids]
                           :archived_directly false}
                    {:archived false})))))

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
  [collection :- CollectionWithLocationAndIDOrRoot, new-location :- LocationPath]
  (let [orig-children-location (children-location collection)
        new-children-location  (children-location (assoc collection :location new-location))
        will-be-in-trash? (str/starts-with? new-location (trash-path))]
    (when will-be-in-trash?
      (throw (ex-info "Cannot `move-collection!` into the Trash. Call `archive-collection!` instead."
                      {:collection collection
                       :new-location new-location})))
    ;; first move this Collection
    (log/infof "Moving Collection %s and its descendants from %s to %s"
               (u/the-id collection) (:location collection) new-location)
    (events/publish-event! :event/collection-touch {:collection-id (:id collection) :user-id api/*current-user-id*})
    (t2/with-transaction [_conn]
      (t2/update! Collection (u/the-id collection)
                  {:location new-location})
      ;; we need to update all the descendant collections as well...
      (t2/query-one
       {:update :collection
        :set    {:location [:replace :location orig-children-location new-children-location]}
        :where  [:like :location (str orig-children-location "%")]}))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Toucan IModel & Perms Method Impls                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private CollectionWithLocationAndPersonalOwnerID
  "Schema for a Collection instance that has a valid `:location`, and a `:personal_owner_id` key *present* (but not
  neccesarily non-nil)."
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
    (t2/exists? Collection
                :id                (first (location-path->ids
                                           (:location collection)))
                :personal_owner_id [:not= nil]))))

;;; ----------------------------------------------------- INSERT -----------------------------------------------------

(t2/define-before-insert :model/Collection
  [{collection-name :name, :as collection}]
  (assert-valid-location collection)
  (assert-valid-namespace (merge {:namespace nil} collection))
  (assoc collection :slug (slugify collection-name)))

(defn- copy-collection-permissions!
  "Grant read permissions to destination Collections for every Group with read permissions for a source Collection,
  and write perms for every Group with write perms for the source Collection."
  [source-collection-or-id dest-collections-or-ids]
  ;; figure out who has permissions for the source Collection...
  (let [group-ids-with-read-perms  (t2/select-fn-set :group_id Permissions
                                                     :object (perms/collection-read-path source-collection-or-id))
        group-ids-with-write-perms (t2/select-fn-set :group_id Permissions
                                                     :object (perms/collection-readwrite-path source-collection-or-id))]
    ;; ...and insert corresponding rows for each destination Collection
    (t2/insert! Permissions
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
  [{:keys [location id], collection-namespace :namespace, :as collection}]
  (when-not (or (is-personal-collection-or-descendant-of-one? collection)
                (is-trash-or-descendant? collection))
    (let [parent-collection-id (location-path->parent-id location)]
      (copy-collection-permissions! (or parent-collection-id (assoc root-collection :namespace collection-namespace))
                                    [id]))))

(t2/define-after-insert :model/Collection
  [collection]
  (u/prog1 collection
    (copy-parent-permissions! (t2.realize/realize collection))))

;;; ----------------------------------------------------- UPDATE -----------------------------------------------------

(mu/defn- check-changes-allowed-for-personal-collection
  "If we're trying to UPDATE a Personal Collection, make sure the proposed changes are allowed. Personal Collections
  have lots of restrictions -- you can't archive them, for example, nor can you transfer them to other Users."
  [collection-before-updates :- CollectionWithLocationAndIDOrRoot
   collection-updates        :- :map]
  ;; you're not allowed to change the `:personal_owner_id` of a Collection!
  ;; double-check and make sure it's not just the existing value getting passed back in for whatever reason
  (let [unchangeable {:personal_owner_id (tru "You are not allowed to change the owner of a Personal Collection.")
                      :authority_level   (tru "You are not allowed to change the authority level of a Personal Collection.")
                      ;; The checks below should be redundant because the `perms-for-moving` and `perms-for-archiving`
                      ;; functions also check to make sure you're not operating on Personal Collections. But as an extra safety net it
                      ;; doesn't hurt to check here too.
                      :location          (tru "You are not allowed to move a Personal Collection.")
                      :archived          (tru "You cannot archive a Personal Collection.")}]
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
  [collection :- (ms/InstanceOf Collection) new-location :- LocationPath]
  (copy-collection-permissions! (parent {:location new-location}) (cons collection (descendants collection))))

(mu/defn- revoke-perms-when-moving-into-personal-collection!
  "When moving a `collection` that is *not* a descendant of a Personal Collection into a Personal Collection or one of
  its descendants (moving across the boundary in the other direction), any previous Group Permissions entries for it
  need to be deleted, so other users cannot access this newly-Personal Collection.

  This needs to be done recursively for all descendants as well."
  [collection :- (ms/InstanceOf Collection)]
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
  [collection]
  (let [collection-before-updates (t2/instance :model/Collection (t2/original collection))
        {collection-name :name
         :as collection-updates}  (or (t2/changes collection) {})]
    (api/check
     (not (is-trash? collection-before-updates))
     [400 "You cannot modify the Trash Collection."])
    ;; VARIOUS CHECKS BEFORE DOING ANYTHING:
    ;; (1) if this is a personal Collection, check that the 'propsed' changes are allowed
    (when (:personal_owner_id collection-before-updates)
      (check-changes-allowed-for-personal-collection collection-before-updates collection-updates))
    ;; (2) make sure the location is valid if we're changing it
    (assert-valid-location collection-updates)
    ;; (3) make sure Collection namespace is valid
    (when (contains? collection-updates :namespace)
      (when-not (namespace-equals? (:namespace collection-before-updates) (:namespace collection-updates))
        (let [msg (tru "You cannot move a Collection to a different namespace once it has been created.")]
          (throw (ex-info msg {:status-code 400, :errors {:namespace msg}})))))
    (assert-valid-namespace (merge (select-keys collection-before-updates [:namespace]) collection-updates))
    ;; (4) If we're moving a Collection from a location on a Personal Collection hierarchy to a location not on one,
    ;; or vice versa, we need to grant/revoke permissions as appropriate (see above for more details)
    (when (api/column-will-change? :location collection-before-updates collection-updates)
      (update-perms-when-moving-across-personal-boundry! collection-before-updates collection-updates))
    ;; OK, AT THIS POINT THE CHANGES ARE VALIDATED. NOW START ISSUING UPDATES
    ;; slugify the collection name in case it's changed in the output; the results of this will get passed along
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

(t2/define-before-delete :model/Collection
  [collection]
  ;; This should never happen, but just to make sure...
  (when (= (u/the-id collection) (trash-collection-id))
    (throw (ex-info "Fatal error: the trash collection cannot be trashed" {})))
  ;; delete all collection children
  (t2/delete! :model/Collection :location (children-location collection))
  (let [affected-collection-ids (cons (u/the-id collection) (collection->descendant-ids collection))]
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
(defmethod mi/perms-objects-set Collection
  [collection-or-id read-or-write]
  (let [collection (if (integer? collection-or-id)
                     (t2/select-one [Collection :id :namespace] :id (collection-or-id))
                     collection-or-id)]
    (if (and (= (u/qualified-name (:namespace collection)) "snippets")
             (not (premium-features/enable-snippet-collections?)))
      #{}
      ;; This is not entirely accurate as you need to be a superuser to modifiy a collection itself (e.g., changing its
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
     [:not= (maybe-alias :type) [:inline instance-analytics-collection-type]]
     [:not= (maybe-alias :type) [:inline trash-collection-type]]
     [:not (maybe-alias :is_sample)]]))

(defn- parent-identity-hash [coll]
  (let [parent-id (-> coll
                      (t2/hydrate :parent_id)
                      :parent_id)
        parent    (when parent-id (t2/select-one Collection :id parent-id))]
    (cond
      (not parent-id) "ROOT"
      (not parent)    (throw (ex-info (format "Collection %s is an orphan" (:id coll)) {:parent-id parent-id}))
      :else           (serdes/identity-hash parent))))

(defmethod serdes/hash-fields Collection
  [_collection]
  [:name :namespace parent-identity-hash :created_at])

(defmethod serdes/extract-query "Collection" [_model {:keys [collection-set]}]
  (let [not-trash-clause [:or
                          [:= :type nil]
                          [:not= :type trash-collection-type]]]
    (if (seq collection-set)
      (t2/reducible-select Collection
                           {:where
                            [:and
                             [:in :id collection-set]
                             not-trash-clause]})
      (t2/reducible-select Collection
                           {:where
                            [:and
                             [:= :personal_owner_id nil]
                             not-trash-clause]}))))

(defmethod serdes/extract-one "Collection"
  ;; Transform :location (which uses database IDs) into a portable :parent_id with the parent's entity ID.
  ;; Also transform :personal_owner_id from a database ID to the email string, if it's defined.
  ;; Use the :slug as the human-readable label.
  [_model-name _opts coll]
  (let [fetch-collection    (fn [id]
                              (t2/select-one Collection :id id))
        {:keys [parent_id]} (some-> coll :id fetch-collection (t2/hydrate :parent_id))
        parent              (some-> parent_id fetch-collection)
        parent-id           (when parent
                              (or (:entity_id parent) (serdes/identity-hash parent)))
        owner-email         (when (:personal_owner_id coll)
                              (t2/select-one-fn :email 'User :id (:personal_owner_id coll)))]
    (-> (serdes/extract-one-basics "Collection" coll)
        (dissoc :location)
        (assoc :parent_id parent-id
               :personal_owner_id owner-email)
        (assoc-in [:serdes/meta 0 :label] (:slug coll)))))

(defmethod serdes/load-xform "Collection" [{:keys [parent_id] :as contents}]
  (let [loc (fn [col-id]
              (if col-id
                (let [{:keys [id location]} (serdes/lookup-by-id Collection col-id)]
                  (str location id "/"))
                "/"))]
    (-> contents
        (dissoc :parent_id)
        (assoc :location (loc parent_id))
        (update :personal_owner_id serdes/*import-user*)
        serdes/load-xform-basics)))

(defmethod serdes/dependencies "Collection"
  [{:keys [parent_id]}]
  (when parent_id
    #{[{:model "Collection" :id parent_id}]}))

(defmethod serdes/generate-path "Collection" [_ coll]
  (serdes/maybe-labeled "Collection" coll :slug))

(defmethod serdes/ascendants "Collection" [_ id]
  (let [{:keys [location]} (t2/select-one :model/Collection :id id)]
    ;; it would work returning just one, but why not return all if it's cheap
    (set (map vector (repeat "Collection") (location-path->ids location)))))

(defmethod serdes/descendants "Collection" [_model-name id]
  (let [location    (t2/select-one-fn :location Collection :id id)
        child-colls (set (for [child-id (t2/select-pks-set :model/Collection {:where [:and
                                                                                      [:like :location (str location id "/%")]
                                                                                      [:or
                                                                                       [:not= :type trash-collection-type]
                                                                                       [:= :type nil]]]})]
                           ["Collection" child-id]))
        dashboards  (set (for [dash-id (t2/select-pks-set :model/Dashboard {:where [:= :collection_id id]})]
                           ["Dashboard" dash-id]))
        cards       (set (for [card-id (t2/select-pks-set :model/Card {:where [:= :collection_id id]})]
                           ["Card" card-id]))]
    (set/union child-colls dashboards cards)))

(defmethod serdes/storage-path "Collection" [coll {:keys [collections]}]
  (let [parental (get collections (:entity_id coll))]
    (concat ["collections"] parental [(last parental)])))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Perms Checking Helper Fns                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn check-write-perms-for-collection
  "Check that we have write permissions for Collection with `collection-id`, or throw a 403 Exception. If
  `collection-id` is `nil`, this check is done for the Root Collection."
  [collection-or-id-or-nil]
  (when (is-trash? collection-or-id-or-nil)
    (throw (ex-info (tru "You cannot modify the Trash Collection.")
                    {:status-code 400})))
  (let [actual-perms   @*current-user-permissions-set*
        required-perms (perms/collection-readwrite-path (if collection-or-id-or-nil
                                                          collection-or-id-or-nil
                                                          root-collection))]
    (when-not (perms/set-has-full-permissions? actual-perms required-perms)
      (throw (ex-info (tru "You do not have curate permissions for this Collection.")
                      {:status-code    403
                       :collection     collection-or-id-or-nil
                       :required-perms required-perms
                       :actual-perms   actual-perms})))))


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
    (check-write-perms-for-collection (:collection_id object-before-update))
    ;; check that we're allowed to modify the new Collection
    (check-write-perms-for-collection (:collection_id object-updates))
    ;; check that the new location is not archived. the root can't be archived.
    (when-let [collection-id (:collection_id object-updates)]
      (api/check-400 (t2/exists? :model/Collection :id collection-id :archived false)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Personal Collections                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn format-personal-collection-name :- ms/NonBlankString
  "Constructs the personal collection name from user name.
  When displaying to users we'll tranlsate it to user's locale,
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

(mu/defn user->personal-collection-name :- ms/NonBlankString
  "Come up with a nice name for the Personal Collection for `user-or-id`."
  [user-or-id user-or-site]
  (let [{first-name :first_name
         last-name  :last_name
         email      :email} (t2/select-one ['User :first_name :last_name :email]
                              :id (u/the-id user-or-id))]
    (format-personal-collection-name first-name last-name email user-or-site)))

(defn personal-collection-with-ui-details
  "For Personal collection, we make sure the collection's name and slug is translated to user's locale
  This is only used for displaying purposes, For insertion or updating  the name, use site's locale instead"
  [{:keys [personal_owner_id] :as collection}]
  (if-not personal_owner_id
    collection
    (let [collection-name (user->personal-collection-name personal_owner_id :user)]
      (assoc collection
             :name collection-name
             :slug (u/slugify collection-name)))))

(mu/defn user->existing-personal-collection :- [:maybe (ms/InstanceOf Collection)]
  "For a `user-or-id`, return their personal Collection, if it already exists.
  Use [[metabase.models.collection/user->personal-collection]] to fetch their personal Collection *and* create it if
  needed."
  [user-or-id]
  (t2/select-one Collection :personal_owner_id (u/the-id user-or-id)))

(mu/defn user->personal-collection :- (ms/InstanceOf Collection)
  "Return the Personal Collection for `user-or-id`, if it already exists; if not, create it and return it."
  [user-or-id]
  (or (user->existing-personal-collection user-or-id)
      (try
        (first (t2/insert-returning-instances! Collection
                                               {:name              (user->personal-collection-name user-or-id :site)
                                                :personal_owner_id (u/the-id user-or-id)}))
        ;; if an Exception was thrown why trying to create the Personal Collection, we can assume it was a race
        ;; condition where some other thread created it in the meantime; try one last time to fetch it
        (catch Throwable e
          (or (user->existing-personal-collection user-or-id)
              (throw e))))))

(def ^:private ^{:arglists '([user-id])} user->personal-collection-id
  "Cached function to fetch the ID of the Personal Collection belonging to User with `user-id`. Since a Personal
  Collection cannot be deleted, the ID will not change; thus it is safe to cache, saving a DB call. It is also
  required to caclulate the Current User's permissions set, which is done for every API call; thus it is cached to
  save a DB call for *every* API call."
  (memoize/ttl
   ^{::memoize/args-fn (fn [[user-id]]
                         [(mdb/unique-identifier) user-id])}
   (fn user->personal-collection-id*
     [user-id]
     (u/the-id (user->personal-collection user-id)))
   ;; cache the results for 60 minutes; TTL is here only to eventually clear out old entries/keep it from growing too
   ;; large
   :ttl/threshold (* 60 60 1000)))

(mu/defn user->personal-collection-and-descendant-ids :- [:sequential {:min 1} ms/PositiveInt]
  "Somewhat-optimized function that fetches the ID of a User's Personal Collection as well as the IDs of all descendants
  of that Collection. Exists because this needs to be known to calculate the Current User's permissions set, which is
  done for every API call; this function is an attempt to make fetching this information as efficient as reasonably
  possible."
  [user-or-id]
  (let [personal-collection-id (user->personal-collection-id (u/the-id user-or-id))]
    (cons personal-collection-id
          ;; `descendant-ids` wants a CollectionWithLocationAndID, and luckily we know Personal Collections always go
          ;; in Root, so we can pass it what it needs without actually having to fetch an entire CollectionInstance
          (descendant-ids {:location "/", :id personal-collection-id}))))

(mi/define-batched-hydration-method include-personal-collection-ids
  :personal_collection_id
  "Efficiently hydrate the `:personal_collection_id` property of a sequence of Users. (This is, predictably, the ID of
  their Personal Collection.)"
  [users]
  (when (seq users)
    ;; efficiently create a map of user ID -> personal collection ID
    (let [user-id->collection-id (t2/select-fn->pk :personal_owner_id Collection
                                   :personal_owner_id [:in (set (map u/the-id users))])]
      (assert (map? user-id->collection-id))
      ;; now for each User, try to find the corresponding ID out of that map. If it's not present (the personal
      ;; Collection hasn't been created yet), then instead call `user->personal-collection-id`, which will create it
      ;; as a side-effect. This will ensure this property never comes back as `nil`
      (for [user users]
        (assoc user :personal_collection_id (or (user-id->collection-id (u/the-id user))
                                                (user->personal-collection-id (u/the-id user))))))))

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

(defmulti allowed-namespaces
  "Set of Collection namespaces (as keywords) that instances of this model are allowed to go in. By default, only the
  default namespace (namespace = `nil`)."
  {:arglists '([model])}
  t2.protocols/dispatch-value)

(defmethod allowed-namespaces :default
  [_]
  #{nil :analytics})

(defn check-collection-namespace
  "Check that object's `:collection_id` refers to a Collection in an allowed namespace (see
  `allowed-namespaces`), or throw an Exception.

    ;; Cards can only go in Collections in the default namespace (namespace = nil)
    (check-collection-namespace Card new-collection-id)"
  [model collection-id]
  (when collection-id
    (let [collection           (or (t2/select-one [Collection :namespace] :id collection-id)
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
                collections)]
    (map (fn [{:keys [id] :as collection}]
           (let [below (apply set/union
                              (for [[child-type coll-id-set] child-type->ancestor-ids]
                                (when (contains? coll-id-set id)
                                  #{child-type})))
                 here (into #{} (for [[child-type coll-id-set] child-type->parent-ids
                                      :when (contains? coll-id-set id)]
                                  child-type))]
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
        (let [path (as-> (location-path->ids (:location collection)) ids
                     (filter all-visible-ids ids)
                     (concat ids [(:id collection)])
                     (interpose :children ids))]
          (update-in m path merge collection)))
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
  (fn [model _] model))

(defmethod hydrate-can-restore :model/Collection [_model colls]
  (when (seq colls)
    (let [coll-id->parent-id (into {} (map (fn [{:keys [id parent_id]}]
                                             [id parent_id])
                                           (t2/hydrate (filter :archived colls) :parent_id)))
          parent-ids (keep val coll-id->parent-id)
          parent-id->archived? (when (seq parent-ids)
                                 (t2/select-pk->fn :archived :model/Collection :id [:in parent-ids]))]
      (for [coll colls
            :let [parent-id (coll-id->parent-id (:id coll))
                  archived-directly? (:archived_directly coll)
                  parent-archived? (get parent-id->archived? parent-id false)]]
        (assoc coll :can_restore (boolean (and (:archived coll)
                                               archived-directly?
                                               (not parent-archived?)
                                               (perms/set-has-full-permissions-for-set?
                                                     @api/*current-user-permissions-set*
                                                     (perms-for-archiving coll)))))))))

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
                                        (not (or (= :model/Collection (t2/model item))
                                                 (collection.root/is-root-collection? item)))
                                        (:archived item)
                                        (mi/can-write? item)))))))
