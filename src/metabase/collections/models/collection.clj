(ns metabase.collections.models.collection
  "Collections are used to organize Cards, Dashboards, and Pulses; as of v0.30, they are the primary way we determine
  permissions for these objects."
  (:refer-clojure :exclude [ancestors descendants])
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.collections.schema :as collections.schema]
   [metabase.config.core :as config]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions :as permissions]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   ;; Trying to use metabase.search would cause a circular reference ;_;
   [metabase.search.spec :as search]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs tru deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]
   [toucan2.protocols :as t2.protocols]))

(set! *warn-on-reflection* true)

(comment collection.root/keep-me)

(p/import-vars [collection.root root-collection root-collection-with-ui-details])

(declare create-collections! update-collections!)

(def ^:private RootCollection
  "Schema for things that are instances of [[metabase.collections.models.collection.root.RootCollection]]."
  [:fn
   {:error/message "an instance of the root Collection"}
   #'collection.root/is-root-collection?])

(def ^:private ^:const collection-slug-max-length
  "Maximum number of characters allowed in a Collection `slug`."
  510)

(def ^:constant trash-collection-type
  "The value of the `:type` field for the Trash collection that holds archived items."
  collections.schema/trash-collection-type)

(def ^:constant library-collection-type
  "The value of the `:type` field for library collections."
  "library")

(def ^:constant library-data-collection-type
  "The value of the `:type` field for collections that only allow tables."
  "library-data")

(def ^:constant library-metrics-collection-type
  "The value of the `:type` field for collections that only allow metrics."
  "library-metrics")

(def ^:constant library-dashboards-collection-type
  "The value of the `:type` field for the Library's Dashboards collections, which hold anything but tables and regular collections."
  "library-dashboards")

(def library-collection-types
  "All library `:type` values — collections users curate as the canonical place to find content.
   Kept as a set so callers (e.g. search ranking) can enumerate them without hard-coding strings."
  #{library-collection-type
    library-data-collection-type
    library-metrics-collection-type
    library-dashboards-collection-type})

(def ^:constant tenant-specific-root-collection-type
  "The value of the `:type` field for root collections that belong to a single tenant"
  "tenant-specific-root-collection")

(def transforms-ns
  "Namespace for transforms"
  :transforms)

(def snippets-ns
  "Namespace for snippets"
  :snippets)

(def data-apps-ns
  "Namespace for the resource collections of data apps"
  :data-apps)

(def data-actions-ns
  "Namespace for the collections of actions without a model"
  :data-actions)

(defn- trash-collection* []
  (collections.db/collection-of-type trash-collection-type))

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

(defn- is-library-dashboards-collection?
  "Is this the Dashboards collection?"
  [collection]
  (= (:type collection) library-dashboards-collection-type))

(defn- set-remote-synced-by-depth!
  "Set `:is_remote_synced` to `remote-synced?` on `collections`, a parent in a statement before its children, since the
  write of each checks the flag of its stored parent."
  [collections remote-synced?]
  (t2/with-transaction [_conn]
    (doseq [[_depth level] (sort-by key (group-by #(count (filter #{\/} (:location %))) collections))]
      (update-collections! (mapv (fn [id] {:id id :is_remote_synced remote-synced?}) (mapv :id level)) nil))))

(defn clear-remote-synced-collection!
  "Marks any remote-synced-collection as non-remote-synced"
  []
  (set-remote-synced-by-depth! (collections.db/remote-synced-collection-locations) false))

(defn has-remote-synced-collection?
  "Return true if any collections are marked remote-sync"
  []
  (pos-int? (collections.db/remote-synced-collection-count)))

(defn library-collection
  "Get the 'library' collection, if it exists."
  []
  (collections.db/collection-of-type library-collection-type))

(def ^{:arglists '([id])} root-collection-type-by-id
  "Return the `:type` of the top-level (root) collection with the given `id`, or `nil` if no
   top-level collection has that id. Caching is keyed by `[app-db-id collection-id]` per the
   `metabase.app-db.core/memoize-for-application-db` docstring — different ids never share cache
   entries, which keeps tests isolated even when other tests run ingestion in parallel.

   Top-level collections change infrequently, so a 1-hour TTL is fine."
  (memoize/ttl
   ^{::memoize/args-fn (fn [[id]] [(mdb/unique-identifier) id])}
   (fn [id]
     (when id
       (collections.db/root-collection-type-by-id id)))
   :ttl/threshold (* 60 60 1000)))

(defn root-collection-type
  "Return the `:type` of the top-level ancestor collection given a collection's materialized path and
   its own type/id. Used by the search ranking spec to power the `:library` scorer for items nested
   inside library trees.

   Resolution rules:
     - `:collection_id` `nil`  →  `nil` (item has no collection)
     - location is `\"/\"` or `nil`  →  the collection's own `:collection_type` (it IS a root)
     - otherwise  →  parse the first id out of the materialized path and look up its type

   Reads `:collection_id`, `:collection_location`, `:collection_type` from the ingestion record map."
  [{:keys [collection_id collection_location collection_type]}]
  (cond
    (nil? collection_id)
    nil

    (or (nil? collection_location) (= "/" collection_location))
    collection_type

    :else
    (when-let [root-id (some-> collection_location
                               (str/split #"/")
                               (->> (remove str/blank?))
                               first
                               parse-long)]
      (root-collection-type-by-id root-id))))

(defn table-root-collection-type
  "Return the `:type` of the top-level ancestor of the collection that holds a record's parent table.
  Reads `:table_collection_id`, `:table_collection_location`, `:table_collection_type` from the ingestion record map."
  [{:keys [table_collection_id table_collection_location table_collection_type]}]
  (root-collection-type {:collection_id       table_collection_id
                         :collection_location table_collection_location
                         :collection_type     table_collection_type}))

(def library-entity-id
  "The entity_id for the Library collection."
  "librarylibrarylibrary")

(def ^:private library-data-entity-id
  "librarylibrarydatadat")

(def ^:private library-metrics-entity-id
  "librarylibrarymetrics")

(def ^:private library-dashboards-entity-id
  "librarylibrarydashbrd")

(def ^:private library-entity-id?
  "Returns true if the given entity ID is one of the hard-coded Library keys."
  #{library-entity-id
    library-data-entity-id
    library-metrics-entity-id
    library-dashboards-entity-id})

(defn- grant-library-collection-permissions!
  "Gives All Users read and Data Analysts read-write access to the Library `collection`."
  [collection]
  (permissions/delete-permissions! (permissions/collection-permission-ids (:id collection)))
  (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
  (perms/grant-collection-readwrite-permissions! (perms/data-analyst-group) collection))

(defn create-library-collection!
  "Create the Library collection. Returns Created collection. Throws if it already exists."
  []
  (let [[library]       (create-collections! [{:name      "Library"
                                               :type      library-collection-type
                                               :location  "/"
                                               :entity_id library-entity-id}])
        base-location   (str "/" (:id library) "/")
        [data metrics]  (create-collections! [{:name      "Data"
                                               :type      library-data-collection-type
                                               :location  base-location
                                               :entity_id library-data-entity-id}
                                              {:name      "Metrics"
                                               :type      library-metrics-collection-type
                                               :location  base-location
                                               :entity_id library-metrics-entity-id}])]
    (run! grant-library-collection-permissions! [library data metrics])
    library))

(methodical/defmethod t2/table-name :model/Collection [_model] :collection)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :collection]
  [_original-model _k]
  :model/Collection)

(t2/deftransforms :model/Collection
  {:namespace       mi/transform-keyword
   :authority_level mi/transform-keyword})

(defn library-root-collection?
  "Is this one of the immutable system-created Library collections (root, data, metrics, or dashboards)?
  Returns false for user-created subcollections that inherit a library type."
  [collection]
  (library-entity-id? (:entity_id collection)))

(defn- system-collection-name
  "The translated name of a system-defined collection, or nil for a collection whose name is its own."
  [collection]
  (cond
    (is-trash? collection)
    (tru "Trash")

    (and (is-library? collection) (library-root-collection? collection))
    (tru "Library")

    (and (is-library-data-collection? collection) (library-root-collection? collection))
    (tru "Data")

    (and (is-library-metrics-collection? collection) (library-root-collection? collection))
    (tru "Metrics")

    (and (is-library-dashboards-collection? collection) (library-root-collection? collection))
    (tru "Dashboards")))

(defn maybe-localize-system-collection-name
  "If the collection is a system-defined collection (Trash, Library, Data, Metrics, or Dashboards), translate the `name`.
  Only overrides names for the system-created library collections, not user-created subcollections.
  This is a public function because we can't rely on `define-after-select` in all circumstances, e.g. when searching
  or listing collection items (where we do a direct DB query without `:model/Collection`)."
  [collection]
  (if-let [localized-name (system-collection-name collection)]
    (assoc collection :name localized-name)
    collection))

(t2/define-after-select :model/Collection [collection]
  (maybe-localize-system-collection-name collection))

(doto :model/Collection
  (derive :metabase/model)
  (derive :hook/entity-id))

(defn- default-audit-collection?
  [{:keys [id] :as _col}]
  (when-not (audit/analytics-dev-mode)
    (= id (:id (audit/default-audit-collection)))))

(defn- check-can-read-keys
  "Throws unless `collection` has the columns its `:can_read` hydration reads."
  [collection]
  (api/check-500 (some? (:id collection)) "No :id is set for a Collection.")
  (api/check-500 (contains? collection :type) "No :type is set for a Collection.")
  (api/check-500 (contains? collection :namespace) "No :namespace is set for a Collection."))

(defn- check-can-write-keys
  "Throws unless `collection` has the columns its `:can_write` hydration reads."
  [collection]
  (check-can-read-keys collection)
  (api/check-500 (contains? collection :location) "No :location is set for a Collection.")
  (api/check-500 (contains? collection :is_remote_synced) "No :is_remote_synced is set for a Collection."))

(def ^:private remote-synced-namespaces
  "The namespaces whose Collections remote sync always syncs, whatever their `is_remote_synced`."
  #{data-apps-ns transforms-ns snippets-ns data-actions-ns})

(defn- remote-sync-writable?
  "Whether remote sync leaves `collection` writable: any Collection unless the instance is read-only, and then one
  that isn't synced, which one of an always-synced namespace and one flagged `is_remote_synced`, as every
  Collection under a synced top-level one is, are."
  [{collection-namespace :namespace, :keys [is_remote_synced]}]
  (not (and (remote-sync/read-only?)
            (or (contains? remote-synced-namespaces (some-> collection-namespace keyword))
                (boolean is_remote_synced)))))

(defn remote-sync-writable-collection-ids
  "The ids among `collection-ids` of the Collections whose content remote sync leaves writable, a nil id, the root,
  included: all of them unless the instance is read-only, and then, from one query, those of Collections that aren't
  synced."
  [collection-ids]
  (let [ids (into #{} (remove nil?) collection-ids)]
    (cond-> (if (and (remote-sync/read-only?) (seq ids))
              (into #{}
                    (comp (filter remote-sync-writable?) (map :id))
                    (collections.db/collection-sync-columns (vec ids)))
              ids)
      (some nil? collection-ids) (conj nil))))

(defn remote-sync-writable-table?
  "Whether remote sync leaves the metadata of `table` writable: any Table unless the instance is read-only, and then
  one that isn't published into a synced Collection."
  [{:keys [is_published collection_id] :as table}]
  (or (not (remote-sync/read-only?))
      (do
        (api/check-500 (contains? table :is_published) "No :is_published is set for a Table.")
        (api/check-500 (contains? table :collection_id) "No :collection_id is set for a Table.")
        (or (not is_published)
            (contains? (remote-sync-writable-collection-ids [collection_id]) collection_id)))))

(defn writable-table-ids
  "The ids of those of `tables` whose content the current user can write: every Table for a superuser, those a data
  analyst has unrestricted view-data permissions on, answered together, and never one a read-only instance syncs."
  [tables]
  (let [permitted (cond
                    (mi/superuser?)
                    tables

                    (api/entitled-data-analyst?)
                    (let [values (perms/table-permissions-for-user (perms/user-info api/*current-user-id*)
                                                                   :perms/view-data
                                                                   (into {} (map (juxt :id :db_id)) tables))]
                      (filter #(perms/at-least-as-permissive? :perms/view-data (get values (:id %)) :unrestricted)
                              tables))

                    :else
                    [])]
    (into #{} (comp (filter remote-sync-writable-table?) (map :id)) permitted)))

(defn hydrate-table-content-can-read
  "Each of `rows`, a model's rows with nil ones kept, with `:can_read` in its metadata: whether the current user reads
  the Table of each, the Tables answered together."
  [rows]
  (let [tables (t2/hydrate (into [] (remove nil?) rows) [:table :can_read])
        flags  (into {} (map (juxt :id (comp mi/can-read? :table))) tables)]
    (for [row rows]
      (when row
        (vary-meta row assoc :can_read (get flags (:id row) false))))))

(defn hydrate-table-content-can-write
  "Each of `rows`, a model's rows with nil ones kept, with `:can_write`: whether the current user writes the content of
  the Table of each, the Tables answered together."
  [rows]
  (let [tables   (t2/hydrate (into [] (remove nil?) rows) :table)
        writable (writable-table-ids (into [] (keep :table) tables))]
    (for [row rows]
      (when row
        (assoc row :can_write (contains? writable (:table_id row)))))))

(defn- audit-collection-hidden?
  "Whether the Collection with `collection-id` is the audit Collection while the audit app is off, which hides it."
  [collection-id]
  (and (not (premium-features/enable-audit-app?))
       (audit/is-collection-id-audit? collection-id)))

(defn- collection-permissions
  "The current user's permission on each of `collections`, by id."
  [collections]
  (perms/collection-permissions-for-user (api/current-user-info) (mapv :id collections) {:root-namespace nil}))

(defn- root-collection-permission-at-least?
  "Whether the current user has `permission` or more on `root`, a root Collection, which is open to everyone in the
  snippets namespace while EE snippet Collections are off."
  [root permission]
  (or (collection.root/unrestricted-snippets? root)
      (perms/collection-permission-at-least?
       (get (perms/collection-permissions-for-user (api/current-user-info) [nil] {:root-namespace (:namespace root)}) nil)
       permission)))

(defn- hydrate-can-read
  "Keeps in the metadata of each of `collections`, under `:can_read`, whether the current user reads it: the trash,
  and otherwise a Collection that is not the hidden audit Collection, on which they have read permission or which is
  open to everyone. A root Collection among them answers for itself."
  [collections]
  (let [rows        (into [] (remove #(or (nil? %) (collection.root/is-root-collection? %))) collections)
        _           (run! check-can-read-keys rows)
        permissions (collection-permissions rows)]
    (for [{:keys [id] :as collection} collections]
      (cond
        (nil? collection)
        nil

        (collection.root/is-root-collection? collection)
        (vary-meta collection assoc :can_read (boolean (root-collection-permission-at-least? collection :read)))

        :else
        (vary-meta collection assoc :can_read
                   (boolean
                    (or (is-trash? collection)
                        (and (not (audit-collection-hidden? id))
                             (or (collection.root/unrestricted-snippets? collection)
                                 (perms/collection-permission-at-least? (get permissions id) :read))))))))))

(defn- hydrate-can-write
  "Sets `:can_write` on each of `collections` to whether the current user writes it: not the
  audit Collection, the trash or anything in it, with write permission or open to everyone, and not kept read-only by
  remote sync. A root Collection among them answers for itself."
  [collections]
  (let [rows        (into [] (remove #(or (nil? %) (collection.root/is-root-collection? %))) collections)
        _           (run! check-can-write-keys rows)
        permissions (collection-permissions rows)]
    (for [{:keys [id] :as collection} collections]
      (cond
        (nil? collection)
        nil

        (collection.root/is-root-collection? collection)
        (assoc collection :can_write (boolean (root-collection-permission-at-least? collection :read-and-write)))

        :else
        (assoc collection :can_write
               (boolean
                (and (not (default-audit-collection? collection))
                     (not (is-trash-or-descendant? collection))
                     (or (collection.root/unrestricted-snippets? collection)
                         (perms/collection-permission-at-least? (get permissions id) :read-and-write))
                     (remote-sync-writable? collection))))))))

(methodical/defmethod t2/batched-hydrate [:model/Collection :can_read]
  [_model _k collections]
  (hydrate-can-read collections))

(methodical/defmethod t2/batched-hydrate [:model/Collection :can_write]
  [_model _k collections]
  (hydrate-can-write collections))

(methodical/defmethod t2/simple-hydrate [metabase.collections.models.collection.root.RootCollection :can_read]
  "Whether the current user reads `root`, a root Collection."
  [_model k root]
  (vary-meta root assoc k (boolean (root-collection-permission-at-least? root :read))))

(methodical/defmethod t2/simple-hydrate [metabase.collections.models.collection.root.RootCollection :can_write]
  "Whether the current user writes `root`, a root Collection."
  [_model k root]
  (assoc root k (boolean (root-collection-permission-at-least? root :read-and-write))))

(defn content-readable-collection-ids
  "The ids among `collection-ids`, a nil id for the root Collection of the `:root-namespace` option included, of the
  Collections whose content the current user reads, from one permission query: those they read and, with the
  `:audit-rules?` option, as for Cards and Dashboards, that aren't the hidden audit Collection."
  [collection-ids {:keys [audit-rules?] :as options}]
  (let [permissions (perms/collection-permissions-for-user (api/current-user-info) (vec collection-ids)
                                                           (select-keys options [:root-namespace]))]
    (into #{}
          (filter (fn [id]
                    (and (perms/collection-permission-at-least? (get permissions id) :read)
                         (not (and audit-rules? id (audit-collection-hidden? id))))))
          (keys permissions))))

(defn content-writable-collection-ids
  "The ids among `collection-ids`, a nil id for the root Collection of the `:root-namespace` option included, of the
  Collections whose content the current user writes, from one permission query and, on a read-only instance, one
  more: those they write, that remote sync leaves writable and, with the `:audit-rules?` option, as for Cards and
  Dashboards, that aren't the audit Collection."
  [collection-ids {:keys [audit-rules?] :as options}]
  (let [permissions   (perms/collection-permissions-for-user (api/current-user-info) (vec collection-ids)
                                                             (select-keys options [:root-namespace]))
        sync-writable (remote-sync-writable-collection-ids (keys permissions))
        audit-id      (when audit-rules? (:id (audit/default-audit-collection)))]
    (into #{}
          (filter (fn [id]
                    (and (perms/collection-permission-at-least? (get permissions id) :read-and-write)
                         (not (and id (= id audit-id)))
                         (contains? sync-writable id))))
          (keys permissions))))

(defn- check-content-keys
  "Throws a 500 unless every non-nil row of `rows` has a `:collection_id` key, naming `model` in the message."
  [model rows]
  (run! #(when %
           (api/check-500 (contains? % :collection_id) (str "No :collection_id is set for a " (name model) ".")))
        rows))

(defn hydrate-content-can-read
  "Each of `rows`, a model's rows with nil ones kept, with `:can_read` in its metadata: whether the current user reads
  the content of its Collection, in the `:root-namespace` nil, with the `:audit-rules?` option of
  [[content-readable-collection-ids]] and the `:visible?` option, a further predicate on a row."
  [model rows {:keys [visible?] :or {visible? (constantly true)} :as options}]
  (check-content-keys model rows)
  (let [readable (content-readable-collection-ids (map :collection_id (remove nil? rows))
                                                  (assoc (select-keys options [:audit-rules?]) :root-namespace nil))]
    (for [row rows]
      (when row
        (vary-meta row assoc :can_read (boolean (and (contains? readable (:collection_id row)) (visible? row))))))))

(defn hydrate-content-can-write
  "Each of `rows`, a model's rows with nil ones kept, with `:can_write`: whether the current user writes the content
  of its Collection, in the `:root-namespace` nil, with the `:audit-rules?` option of
  [[content-writable-collection-ids]] and the `:visible?` option, a further predicate on a row."
  [model rows {:keys [visible?] :or {visible? (constantly true)} :as options}]
  (check-content-keys model rows)
  (let [writable (content-writable-collection-ids (map :collection_id (remove nil? rows))
                                                  (assoc (select-keys options [:audit-rules?]) :root-namespace nil))]
    (for [row rows]
      (when row
        (assoc row :can_write (boolean (and (contains? writable (:collection_id row)) (visible? row))))))))

(defn can-write-collection-or-root?
  "Whether the current user can write the Collection with `collection-id`, or, for nil, the root Collection of the
  `:root-namespace` option."
  [collection-id {:keys [root-namespace]}]
  (boolean
   (mi/can-write? (t2/hydrate (if collection-id
                                (api/check-404 (collections.db/collection collection-id))
                                (root-collection-with-ui-details root-namespace))
                              :can_write))))

(defn can-write-all-collections-or-root?
  "Whether the current user can write every one of the Collections with `collection-ids`, nil for the root Collection of
  the `:root-namespace` option, as [[can-write-collection-or-root?]] answers for one, from one read of the Collections
  and one answer for all of them. False when one does not exist, which that function answers with a 404."
  [collection-ids {:keys [root-namespace]}]
  (let [ids    (into [] (comp (remove nil?) (distinct)) collection-ids)
        stored (if (seq ids) (collections.db/collections-by-id ids) {})]
    (and (= (count stored) (count ids))
         (every? mi/can-write? (t2/hydrate (vec (vals stored)) :can_write))
         (or (not-any? nil? collection-ids)
             (mi/can-write? (t2/hydrate (root-collection-with-ui-details root-namespace) :can_write))))))

(def collection-content-models
  "The models whose rows live in a Collection, by their `collection_id`."
  [:model/Card :model/Dashboard :model/Document :model/Timeline :model/Exploration :model/Action
   :model/ModerationReview])

(def AuthorityLevel
  "Malli Schema for valid collection authority levels, normalized from their names."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :official])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Slug Validation                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn slugify
  "The slug a collection named `collection-name` is stored with."
  [collection-name]
  ;; double-check that someone isn't trying to use a blank string as the collection name
  (when (str/blank? collection-name)
    (throw (ex-info (tru "Collection name cannot be blank!")
                    {:status-code 400, :errors {:name (tru "cannot be blank")}})))
  (u/slugify collection-name {:max-length collection-slug-max-length}))

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

(def ^:private CollectionInstance
  "Schema for a Collection as it flows through this namespace: a raw `:model/Collection` Toucan instance, one
  hydrated with any of the computed keys this namespace or [[metabase.collections.children]] adds, or a
  null-padded row from the synced-collection-items union query. Every key is optional because different call sites
  select or hydrate different subsets."
  [:map {:closed true}
   [:id                    {:optional true} ms/PositiveInt]
   ;; system collections (Trash, Library) carry a deferred i18n name, localized per-request (#59662)
   [:name                  {:optional true} [:or :string ms/LocalizedString]]
   [:description           {:optional true} [:maybe :string]]
   [:archived              {:optional true} :boolean]
   [:archived_directly     {:optional true} [:maybe :boolean]]
   [:archive_operation_id  {:optional true} [:maybe :string]]
   [:location              {:optional true} LocationPath]
   [:personal_owner_id     {:optional true} [:maybe ms/PositiveInt]]
   [:slug                  {:optional true} :string]
   [:namespace             {:optional true} [:maybe [:or :keyword :string]]]
   [:authority_level       {:optional true} [:maybe [:or :keyword :string]]]
   [:entity_id             {:optional true} :string]
   [:created_at            {:optional true} ms/TemporalInstant]
   [:type                  {:optional true} [:maybe [:or :keyword :string]]]
   [:is_sample             {:optional true} :boolean]
   [:is_remote_synced      {:optional true} [:maybe :boolean]]
   [:is_personal           {:optional true} :boolean]
   [:is_upload             {:optional true} [:maybe :boolean]]
   [:parent_id             {:optional true} [:maybe ms/PositiveInt]]
   [:can_write             {:optional true} :boolean]
   [:can_restore           {:optional true} :boolean]
   [:can_delete            {:optional true} :boolean]
   [:effective_location    {:optional true} :string]
   [:effective_children    {:optional true}
    [:maybe [:set [:map {:closed true}
                   [:id          ms/PositiveInt]
                   [:name        :string]
                   [:description [:maybe :string]]
                   [:type        [:maybe :string]]]]]]
   [:collection_id         {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position   {:optional true} [:maybe ms/PositiveInt]]
   [:collection_type       {:optional true} [:maybe :string]]
   [:dashboard_id          {:optional true} [:maybe ms/PositiveInt]]
   [:database_id           {:optional true} [:maybe ms/PositiveInt]]
   [:dataset_query         {:optional true} :nil]
   [:display               {:optional true} [:maybe :string]]
   [:icon                  {:optional true} [:maybe :string]]
   [:last_edit_email       {:optional true} [:maybe :string]]
   [:last_edit_first_name  {:optional true} [:maybe :string]]
   [:last_edit_last_name   {:optional true} [:maybe :string]]
   [:last_edit_timestamp   {:optional true} [:maybe :string]]
   [:last_edit_user        {:optional true} [:maybe :int]]
   [:last_used_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:model                 {:optional true} [:maybe :string]]
   [:model_ranking         {:optional true} [:maybe :int]]
   [:moderated_status      {:optional true} [:maybe :string]]
   [:query_type            {:optional true} [:maybe :string]]
   [:table_id              {:optional true} [:maybe ms/PositiveInt]]
   [:total_count           {:optional true} [:maybe :int]]
   [:here                  {:optional true} [:set :keyword]]
   [:below                 {:optional true} [:set :keyword]]
   [:is_library_root       {:optional true} :boolean]
   [:effective_ancestors   {:optional true} [:sequential ::collections.schema/collection-or-root]]])

(mu/defn shared-tenant-collection?
  "Whether or not a collection is a tenant collection."
  [{:keys [namespace]} :- [:or RootCollection CollectionInstance]]
  (= (some-> namespace name)
     (name shared-tenant-ns)))

(mu/defn location-path :- LocationPath
  "Build a 'location path' from a sequence of `collections-or-ids`.

     (location-path 10 20) ; -> \"/10/20/\""
  [& collections-or-ids :- [:* [:or ms/PositiveInt CollectionInstance]]]
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

(def ^:private library-content-specs
  "A map from the `:type` of a library collection to what it permits in it, and the error when a thing is refused."
  {library-collection-type
   {:allowed-content-types #{library-data-collection-type
                             library-metrics-collection-type
                             library-dashboards-collection-type}
    :error-message         "Cannot add anything to the semantic layer"}

   library-data-collection-type
   {:allowed-content-types #{:table library-data-collection-type}
    :error-message         "Can only add tables to the 'Data' collection"}

   library-metrics-collection-type
   {:allowed-content-types #{:metric library-metrics-collection-type}
    :error-message         "Can only add metrics to the 'Metrics' collection"}

   library-dashboards-collection-type
   {:allowed-content-types (complement #{:table :collection})
    :error-message         "Cannot add tables or regular collections to the 'Dashboards' collection"}})

(def ^:private library-section-types
  "The types of the library collections whose sub-collections have the type of their parent."
  #{library-data-collection-type library-metrics-collection-type library-dashboards-collection-type})

(defn- check-library-placement
  "Throws a 400 when a library collection of type `parent-type` can't hold content of `content-type`, a model, a card
  type or a collection type."
  [content-type parent-type]
  (when-let [{:keys [allowed-content-types error-message]} (library-content-specs parent-type)]
    (when-not (allowed-content-types content-type)
      (throw (ex-info error-message {:status-code 400})))))

(defn content-parent
  "The Collection with `collection-id` as the checks of the content put in it read it, nil for the root; throws a 404
  when it does not exist."
  [collection-id]
  (when collection-id
    (or (collections.db/collection-for-content-checks collection-id)
        (let [msg (tru "Collection does not exist.")]
          (throw (ex-info msg {:status-code 404, :errors {:collection_id msg}}))))))

(defn- content-parent-or-nil
  "`collection`, a Collection [[content-parent]] loaded, or the one with that id, nil when there is none."
  [collection]
  (if (map? collection)
    collection
    (some-> collection collections.db/collection-for-content-checks)))

(defn- check-library-content
  "Throws a 400 when the collection `parent` can't hold content of `content-type`; with the Library feature, tables go
  only in Data collections."
  [content-type parent]
  (let [parent-type (:type parent)]
    (check-library-placement content-type parent-type)
    (when (and (= content-type :table)
               (not= parent-type library-data-collection-type)
               (premium-features/has-feature? :library))
      (throw (ex-info "Tables can only be added to 'Data' collections" {:status-code 400})))))

(defn- check-data-app-content
  "Throws a 400 when `content-type` can't go in a collection of the data apps namespace, which holds only questions
  and implicit actions."
  [content-type]
  (when-not (or (= content-type :model/CollectionBookmark)
                (contains? #{:question :action} (keyword content-type)))
    (throw (ex-info (tru "A data app''s collection can hold only questions and implicit actions.") {:status-code 400}))))

(defn check-allowed-content
  "Checks the content of a collection before saving it, throwing when `collection`, a Collection id or the row
  [[content-parent]] gives, can't hold content of `model-type`, where a data app's collection holds only what a
  remote-sync pull of the app accepts."
  [model-type collection]
  (when (and collection (some? model-type))
    (let [parent (content-parent-or-nil collection)]
      (when (and parent (perms/data-app-collection? parent))
        (check-data-app-content model-type))
      (check-library-content model-type parent)))
  true)

;; This function is defined later after children-location is available

(def ^:private CollectionWithLocationOrRoot
  [:or
   RootCollection
   CollectionInstance])

(def CollectionWithLocationAndIDOrRoot
  "Schema for a valid `CollectionInstance` that has valid `:location` and `:id` properties, or the special
  `root-collection` placeholder object."
  [:or
   RootCollection
   CollectionInstance])

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
  (collections.db/collection-ids-with-location-like (str (children-location collection) \%)))

(mu/defn descendant-ids-of-all :- [:set ms/PositiveInt]
  "The IDs of all descendant Collections of any of `collections`, in one query."
  [collections :- [:sequential CollectionWithLocationAndIDOrRoot]]
  (if (empty? collections)
    #{}
    (set (collections.db/collection-ids-with-location-like-any
          (mapv #(str (children-location %) \%) collections)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Personal Collections                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn format-personal-collection-name :- ms/NonBlankString
  "Constructs the personal collection name from user name.
  When displaying to users we'll translate it to user's locale,
  but to keeps things consistent in the database, we'll store the name in site's locale.

  Practically, use `user-or-site` = `:site` when insert or update the name in database,
  and `:user` when we need the name for displaying purposes"
  [first-name    :- [:maybe :string]
   last-name     :- [:maybe :string]
   email         :- [:maybe :string]
   user-or-site  :- [:enum :user :site]]
  (if (= :user user-or-site)
    (cond
      (and first-name last-name) (tru "{0} {1}''s Personal Collection" first-name last-name)
      :else                      (tru "{0}''s Personal Collection" (or first-name last-name email)))
    (cond
      (and first-name last-name) (trs "{0} {1}''s Personal Collection" first-name last-name)
      :else                      (trs "{0}''s Personal Collection" (or first-name last-name email)))))

(mu/defn user->personal-collection-names :- [:map-of ms/PositiveInt :string]
  "Come up with a nice name for the Personal Collection for the passed `user-or-ids`.
  Returns a map of user-id -> name"
  [user-or-ids  :- [:sequential ms/PositiveInt]
   user-or-site :- [:enum :user :site]]
  (into {} (when-let [ids (seq (filter some? (map u/the-id user-or-ids)))]
             (update-vals (collections.db/user-name-parts-by-id ids)
                          #(format-personal-collection-name (:first_name %) (:last_name %) (:email %) user-or-site)))))

(mu/defn user->personal-collection-name :- ms/NonBlankString
  "Calls `user->personal-collection-names` for a single user-id and returns the name"
  [user-or-id   :- ms/PositiveInt
   user-or-site :- [:enum :user :site]]
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

(defn maybe-mark-collection-as-library-root
  "Given a collection, adds `:is_library_root true` to exactly those collections which have hard-coded Library
  `:entity_id`s - the Library itself, and it's magic top-level collections.

  This uses the `:entity_id`s rather than `:type`s because it only applies to those root collections at the top level,
  not to all of them."
  [{:keys [entity_id] :as collection}]
  (cond-> collection
    (library-entity-id? entity_id) (assoc :is_library_root true)))

(defn personal-collection-with-ui-details
  "For Personal collection, we make sure the collection's name and slug is translated to user's locale
  This is only used for displaying purposes, For insertion or updating  the name, use site's locale instead"
  [collection]
  (first (personal-collections-with-ui-details [collection])))

(defenterprise maybe-localize-tenant-collection-names
  "For tenant root collections, localize the name to the user's locale.

  OSS version: returns collections unchanged."
  metabase-enterprise.tenants.models
  [collections]
  collections)

(defn maybe-localize-tenant-collection-name
  "Single-collection version of [[maybe-localize-tenant-collection-names]]."
  [collection]
  (first (maybe-localize-tenant-collection-names [collection])))

(def ^:private CollectionWithLocationAndPersonalOwnerID
  "Schema for a Collection instance that has a valid `:location`, and a `:personal_owner_id` key *present* (but not
  necessarily non-nil)."
  CollectionInstance)

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
      (collections.db/personal-collection? id)))))

(def ^:private CollectionWithNamespace
  "Schema for a Collection instance that has a valid `:location`, and a `:namespace` key *present* (but not
  necessarily non-nil)."
  CollectionInstance)

(mu/defn is-dedicated-tenant-collection-or-descendant? :- :boolean
  "Is `collection` a Tenant Collection, or a descendant of one?"
  [collection :- CollectionWithNamespace]
  ;; If collection has namespace = "tenant-specific" we know it's in the dedicated tenant namespace
  (= (some-> (:namespace collection) name) "tenant-specific"))

(def ^:private UserOrId
  "A User ID, or anything with one (e.g. a full User instance) — [[u/the-id]] accepts either."
  [:or ms/PositiveInt :metabase.users.schema/user])

(mu/defn user->existing-personal-collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "For a `user-or-id`, return their personal Collection, if it already exists.
  Use [[metabase.collections.models.collection/user->personal-collection]] to fetch their personal Collection *and*
  create it if needed."
  [user-or-id :- UserOrId]
  (collections.db/personal-collection-of-user (u/the-id user-or-id)))

(mu/defn user->personal-collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "Return the Personal Collection for `user-or-id`, if it already exists; if not, create it and return it.
  Personal collection should be created on user creation, but creates if missing for backwards compatibility"
  [user-or-id :- UserOrId]
  ;; API key users do not get personal collections
  (when-not (api-key/is-api-key-user? (u/the-id user-or-id))
    (or (user->existing-personal-collection user-or-id)
        (try
          (first (create-collections! [{:name              (user->personal-collection-name user-or-id :site)
                                        :personal_owner_id (u/the-id user-or-id)}]))
          ;; if an Exception was thrown why trying to create the Personal Collection, we can assume it was a race
          ;; condition where some other thread created it in the meantime; try one last time to fetch it
          (catch Throwable e
            (or (user->existing-personal-collection user-or-id)
                (throw e)))))))

(mu/defn create-personal-collections!
  "Create the Personal Collection of each of the Users with `user-ids` that has none, but those of API keys, with a
  number of statements that does not grow with the users."
  [user-ids :- [:sequential ms/PositiveInt]]
  (when-let [user-ids (not-empty (collections.db/non-api-key-user-ids (set user-ids)))]
    (let [owned   (collections.db/personal-collection-ids-by-owner user-ids)
          missing (vec (remove #(contains? owned %) (sort user-ids)))]
      (when (seq missing)
        (let [names (user->personal-collection-names missing :site)]
          (create-collections! (for [user-id missing]
                                 {:name              (get names user-id)
                                  :personal_owner_id user-id})))))))

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
   ;;
   ;; TODO (Chris 2026-08-18) -- The claim that Personal Collections cannot be deleted does not hold when a
   ;; transaction rolls back: the collection disappears while its ID remains cached for the rest of the TTL.
   ;; Tests evict this cache at the `with-temp` boundary (see [[metabase.test.util]]). Production has no
   ;; equivalent boundary and would need an after-rollback hook alongside the commit hooks.
   :ttl/threshold (* 60 60 1000)))

(mu/defn user->personal-collection-and-descendant-ids :- [:sequential ms/PositiveInt]
  "Somewhat-optimized function that fetches the ID of a User's Personal Collection as well as the IDs of all descendants
  of that Collection. Exists because this needs to be known to calculate the Current User's permissions set, which is
  done for every API call; this function is an attempt to make fetching this information as efficient as reasonably
  possible."
  [user-or-id :- ms/PositiveInt]
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
    (let [non-api-user-ids (collections.db/non-api-key-user-ids (set (map u/the-id users)))
          user-id->collection-id (when (seq non-api-user-ids)
                                   (collections.db/personal-collection-ids-by-owner non-api-user-ids))]
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
    (let [personal-collection-ids (collections.db/personal-collection-ids)
          ;; Personal Collections only ever live in the Root Collection, so a Collection is inside one exactly when
          ;; the first ID of its location path is a Personal Collection. Testing that ID against the set beats
          ;; scanning every personal collection per row: instances with thousands of each made this quadratic.
          location-is-personal    (fn [location]
                                    (boolean
                                     (and (string? location)
                                          (contains? personal-collection-ids (first (location-path->ids location))))))]
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

(def ^:private CollectionVisibilityConfig
  [:map {:closed true}
   [:include-trash-collection? {:optional true} :boolean]
   [:include-archived-items {:optional true} [:enum :only :exclude :all]]
   [:archive-operation-id {:optional true} [:maybe :string]]
   [:permission-level {:optional true} [:enum :read :write]]
   [:root-namespace [:maybe [:or :keyword :string]]]])

(def ^:private default-visibility-config
  {:include-archived-items :exclude
   :include-trash-collection? false
   :archive-operation-id nil
   :permission-level :read
   :root-namespace nil})

(defn- effective-child-of-filter-clause
  [parent-coll collection-table-alias visibility-config]
  (let [->col (fn [col-name]
                (keyword (str (name collection-table-alias)
                              "."
                              col-name)))]
    [:and
     (perms/visible-collections-filter-clause (->col "id") (api/current-user-info) visibility-config)
     (if (is-trash? parent-coll)
       [:= (->col "archived_directly") true]
       [:and
        ;; an effective child is a descendant of the parent collection
        [:like (->col "location") (str (children-location parent-coll) "%")]
        ;; but NOT a child of any OTHER visible collection.
        [:not [:exists ^:allow-subquery {:select 1
                                         :from [[:collection :c2]]
                                         :where [:and
                                                 (perms/visible-collections-filter-clause :c2.id (api/current-user-info)
                                                                                          visibility-config)
                                                 [:= (->col "location") [:concat :c2.location :c2.id (h2x/literal "/")]]
                                                 (when-not (collection.root/is-root-collection? parent-coll)
                                                   [:not= :c2.id [:inline (u/the-id parent-coll)]])]}]]])]))

(defn visible-collection-ids
  "The ids among `collection-ids` of the Collections the current user can see at `permission-level`, `:read` or
  `:write`, answered together; the trash is visible to everyone.

  It answers only the permission question: unlike `perms/visible-collections-filter-clause` it applies no archival
  filtering, and no `shared-tenant-collection` exclusion for instances with tenants disabled. That is safe for the
  ancestors and descendants this is used on, because a collection tree never spans namespaces (see
  `assert-valid-namespace`): they sit in the namespace of a collection the caller already holds, and so were subject
  to the same filtering when the caller obtained it."
  [collection-ids permission-level]
  (let [ids         (vec (distinct collection-ids))
        required    (case permission-level :read :read, :write :read-and-write)
        permissions (perms/collection-permissions-for-user (api/current-user-info) ids {:root-namespace nil})
        trash-id    (trash-collection-id)]
    (into #{}
          (filter #(or (= % trash-id)
                       (perms/collection-permission-at-least? (get permissions %) required)))
          ids)))

(defn- real-location-path
  "The location of `collection` as its effective location hides parts of: the trash for one archived directly."
  [collection]
  (if (:archived_directly collection)
    (trash-path)
    (:location collection)))

(mi/define-batched-hydration-method effective-location-path*
  :effective_location
  "Given a seq of `collections`, batch hydrates them with their effective location, their ancestors answered together."
  [collections]
  (when (seq collections)
    (let [rows    (remove #(or (nil? %) (collection.root/is-root-collection? %)) collections)
          visible (visible-collection-ids (mapcat #(location-path->ids (real-location-path %)) rows) :read)]
      (for [collection collections]
        (when (some? collection)
          (assoc collection
                 :effective_location
                 (when-not (collection.root/is-root-collection? collection)
                   (apply location-path (filter visible (location-path->ids (real-location-path collection)))))))))))

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
   (collection.root/root-collection-with-ui-details nil)
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
                                 (collections.db/collection-columns-by-id effective-parent-fields parent-ids)))]
    (map
     (fn [collection]
       (let [parent-id (-> collection :effective_location location-path->parent-id)]
         (assoc collection :effective_parent (id->parent-coll parent-id))))
     collections)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                          Nested Collections: Ancestors, Children, Child Collections                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- ancestors* :- [:maybe [:sequential (ms/InstanceOf :model/Collection)]]
  [{:keys [location]} :- CollectionWithLocationOrRoot]
  (when-let [ancestor-ids (seq (location-path->ids location))]
    (collections.db/ancestor-summaries ancestor-ids)))

(mi/define-simple-hydration-method ancestors
  :ancestors
  "Fetch ancestors (parent, grandparent, etc.) of a `collection`. These are returned in order starting with the
  highest-level (e.g. most distant) ancestor."
  [collection]
  (ancestors* collection))

(defn- effective-ancestors*
  "Given a collection, return the effective ancestors of that collection, from `collection-id->collection`, whose
  Collections are hydrated with `:can_read` and `:can_write`, each ancestor keeping its `:can_write`."
  [collection collection-id->collection]
  (if (or (nil? collection)
          (collection.root/is-root-collection? collection))
    []
    (some->> (effective-location-path collection)
             location-path->ids
             (keep collection-id->collection)
             (filter mi/can-read?)
             (map #(t2/instance :model/Collection (select-keys % [:name :id :personal_owner_id :type :can_write])))
             (concat (let [root (t2/hydrate (root-collection-with-ui-details (:namespace collection)) :can_read :can_write)]
                       (when (mi/can-read? root)
                         [root])))
             doall)))

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
                                    (u/index-by :id (t2/hydrate (vals (collections.db/collections-by-id all-ids))
                                                                :can_read :can_write))
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
  "Return all descendant collections of a `collection`, including children, grandchildren, and so forth. Excludes
  other users' Personal Collections, regardless of whether we should actually be allowed to see them (e.g. admins
  have perms for all Collections) -- this is done to keep the Root Collection View for admins from getting crazily
  cluttered with Personal Collections belonging to other users. `archived?`, if given (true or false), restricts
  to Collections with that archived status. `visibility-clause`, if given, is
  a `perms/visible-collections-filter-clause` to restrict the descendants further."
  ([collection :- CollectionWithLocationAndIDOrRoot]
   (descendants-flat collection nil))
  ([collection :- CollectionWithLocationAndIDOrRoot, archived? :- [:maybe :boolean]]
   (descendants-flat collection archived? nil))
  ([collection        :- CollectionWithLocationAndIDOrRoot
    archived?         :- [:maybe :boolean]
    visibility-clause :- [:maybe vector?]]
   (collections.db/descendant-summaries
    (children-location collection) api/*current-user-id* archived? visibility-clause)))

(mu/defn descendants-flat-for :- [:sequential CollectionWithLocationAndIDOrRoot]
  "Like [[descendants-flat]], but returns the descendants of *any* of
  `collections` in a single query. Also selects `:type`, so callers can
  classify descendants without another lookup."
  [collections :- [:sequential CollectionWithLocationAndIDOrRoot]]
  (if (empty? collections)
    []
    (collections.db/descendant-summaries-with-type
     (map #(str (children-location %) "%") collections)
     api/*current-user-id*)))

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
  [collection :- CollectionWithLocationAndIDOrRoot]
  ;; first, fetch all the descendants of the `collection`, and build a map of location -> children. This will be used
  ;; so we can fetch the immediate children of each Collection
  (let [location->children (group-by :location (descendants-flat collection))
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
  [collection             :- CollectionWithLocationAndIDOrRoot
   collection-table-alias :- :keyword
   visibility-config      :- CollectionVisibilityConfig
   & additional-honeysql-where-clauses :- [:* ::h2x/honeysql-expr]]
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
   & additional-honeysql-where-clauses :- [:* ::h2x/honeysql-expr]]
  ^:allow-subquery {:select [:id :name :description :type]
                    :from   [[:collection :col]]
                    :where  (apply effective-children-where-clause collection :col visibility-config additional-honeysql-where-clauses)})

(mu/defn- effective-children* :- [:set (ms/InstanceOf :model/Collection)]
  [collection :- CollectionWithLocationAndIDOrRoot]
  (set (collections.db/effective-children (effective-children-where-clause collection
                                                                           (t2/table-name :model/Collection)
                                                                           (assoc default-visibility-config
                                                                                  :root-namespace (:namespace collection))))))

(mi/define-simple-hydration-method effective-children
  :effective_children
  "Get the descendant Collections of `collection` that should be presented to the current User as direct children of
  this Collection. See documentation for [[metabase.collections.models.collection/effective-children-query]] for more
  details."
  [collection]
  (effective-children* collection))

;;; -------------------------------------------------- Remote Sync -------------------------------------------------------

(defn set-remote-synced!
  "Marks `collection` and its descendants as remote-synced, or as not remote-synced when `remote-synced?` is false."
  [collection remote-synced?]
  (set-remote-synced-by-depth! (collections.db/subtree-locations-to-flag (:id collection)
                                                                         (children-location collection)
                                                                         remote-synced?)
                               remote-synced?))

(methodical/defmethod t2/batched-hydrate [:default :is_remote_synced]
  "Batch hydration for whether an item is remote synced"
  [_model k items]
  (mi/instances-with-hydrated-data items k
                                   #(into {}
                                          (map (juxt :id :is_remote_synced)
                                               items))
                                   :id
                                   {:default false}))

(defn- hydrate-item-is-remote-synced
  "Sets `k` on `items` of `model` to whether the Collection of each is remote-synced."
  [model k items]
  (mi/instances-with-hydrated-data items k
                                   #(into {}
                                          (map (juxt :id (comp api/bit->boolean :is_remote_synced)))
                                          (collections.db/collection-remote-synced-by-item-id model (map :id items)))
                                   :id
                                   {:default false}))

(defn- hydrate-item-collection-namespace
  "Sets `k` on `items` of `model` to the namespace of the Collection of each."
  [model k items]
  (mi/instances-with-hydrated-data items k
                                   #(into {}
                                          (collections.db/collection-namespaces-of model (map :id items)))
                                   :id
                                   {:default nil}))

(doseq [model collection-content-models]
  (methodical/add-primary-method! #'t2/batched-hydrate [model :is_remote_synced]
                                  (fn [_next-method model k items] (hydrate-item-is-remote-synced model k items)))
  (methodical/add-primary-method! #'t2/batched-hydrate [model :collection_namespace]
                                  (fn [_next-method model k items] (hydrate-item-collection-namespace model k items))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Recursive Operations: Moving & Archiving                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn collection-and-descendant-ids :- [:set ms/PositiveInt]
  "The ids of this collection and all its unarchived descendants, on which the current user needs write permission.

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
  (when (collections.db/personal-collection? (u/the-id collection))
    (throw (Exception. (tru "You cannot operate on a Personal Collection."))))
  (set (cons (u/the-id collection)
             (collections.db/unarchived-collection-ids-with-location-like (str (children-location collection) "%")))))

(mu/defn collection-ids-for-archiving :- [:set ms/PositiveInt]
  "The ids of the Collections on which the current user needs write permission to archive a `collection`. Since archiving a Collection is
  *recursive* (i.e., it applies to all the descendant Collections of that Collection), we require write ('curate')
  permissions for the Collection itself and all its descendants, but not for its parent Collection.

  For example, suppose we have a Collection hierarchy like:

    A > B > C

  To archive B, you need write permissions for B and C:

  *  B, because you are archiving it
  *  C, because by archiving its parent, you are archiving it as well

  You do NOT need permissions for A (the parent), as you're not modifying A itself, only removing B from it."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (collection-and-descendant-ids collection))

(mu/defn collection-ids-for-moving :- [:set ms/PositiveInt]
  "The ids of the Collections on which the current user needs write permission to move a `collection`, the new
  parent aside when it is a root Collection, which the caller checks through its own `can-write?`. Moving is recursive, so we require
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
  (when (collection.root/is-root-collection? collection)
    (throw (Exception. (tru "You cannot move the Root Collection."))))
  (cond-> (into #{(u/the-id collection)}
                (collections.db/unarchived-collection-ids-with-location-like (str (children-location collection) "%")))
    (not (collection.root/is-root-collection? new-parent)) (conj (u/the-id new-parent))))

(mu/defn collection->descendant-ids :- [:maybe [:set ms/PositiveInt]]
  "Gets the IDs of all descendant collections for a given collection.

  Returns a set of positive integers representing descendant collection IDs, or nil if none exist."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (collections.db/collection-ids-with-location-like (str (children-location collection) "%")))

(mu/defn collection-ids-for-unarchiving :- [:set ms/PositiveInt]
  "The ids of the Collections on which the current user needs write permission to unarchive a `collection`. Since unarchiving is
  *recursive* (all descendants archived together get unarchived), we require write ('curate')
  permissions for the collection and all descendants being unarchived."
  [collection :- CollectionWithLocationAndIDOrRoot]
  (set (cons (u/the-id collection)
             (when-let [archive-operation-id (:archive_operation_id collection)]
               (collections.db/archived-collection-ids-in-operation-with-location-like
                (str (children-location collection) "%")
                archive-operation-id)))))

(mu/defn can-write-collection-ids? :- :boolean
  "Whether the current user has write permission on each of the Collections with `collection-ids`, answered together."
  [collection-ids :- [:sequential ms/PositiveInt]]
  (let [permissions (perms/collection-permissions-for-user (api/current-user-info) collection-ids {:root-namespace nil})]
    (every? #(perms/collection-permission-at-least? (get permissions %) :read-and-write) collection-ids)))

(mu/defn parent-or-root :- CollectionWithLocationAndIDOrRoot
  "The Collection with `parent-id`, or for nil the root Collection of `collection-namespace`, throwing a 404 when there
  is no such Collection."
  [collection-namespace :- [:maybe [:or :keyword :string]]
   parent-id            :- [:maybe ms/PositiveInt]]
  (if parent-id
    (api/check-404 (collections.db/collection-location-columns parent-id))
    (assoc root-collection :namespace collection-namespace)))

(defn- move-target
  "The Collection `changes` move `collection` into, or nil when they leave it where it is."
  [collection changes]
  (when (or (contains? changes :parent_id) (contains? changes :location))
    (let [new-parent (parent-or-root (:namespace collection) (if (contains? changes :parent_id)
                                                               (:parent_id changes)
                                                               (location-path->parent-id (:location changes))))]
      (when (not= (:location collection) (children-location new-parent))
        new-parent))))

(defn- can-move-to?
  "Whether the current user writes `new-parent` and `collection` with its descendants, which moving it into
  `new-parent` takes."
  [collection new-parent]
  (boolean
   (and (not= (u/the-id collection) (:id (audit/default-custom-reports-collection)))
        (mi/can-write? (t2/hydrate new-parent :can_write))
        (can-write-collection-ids? (vec (collection-ids-for-moving collection new-parent))))))

(defmethod mi/can-create? :model/Collection
  [_model {:keys [parent_id location], collection-namespace :namespace}]
  (can-write-collection-or-root? (or parent_id (some-> location location-path->parent-id))
                                 {:root-namespace collection-namespace}))

(def ^:private archivable-item-models
  "The models that follow the `archived` state of their Collection by `collection_id`, in the order their cascades run,
  Cards before the Dashboards and Documents that cascade to the Cards they hold."
  [:model/Card :model/Dashboard :model/Document :model/Exploration :model/Timeline :model/NativeQuerySnippet])

(defn- archive-followers-updatable?
  "Whether the current user may apply `changes`, which archive or restore `collection`, to every item the change takes
  along, the items of the Collections under it too: each kind of item loaded once, and answered once, by the selection
  the cascade writes."
  [collection changes]
  (or (not (mi/changes-archived? collection changes))
      (let [archive? (boolean (:archived changes))
            ids      (vec (if archive?
                            (cons (:id collection) (collections.db/unarchived-collection-ids-with-location-like
                                                    (str (children-location collection) "%")))
                            (collection-ids-for-unarchiving collection)))
            rows-of  (if archive?
                       collections.db/items-archived-with-collections
                       collections.db/items-restored-with-collections)]
        (every? #(mi/can-update-followers? % (rows-of % ids) changes) archivable-item-models))))

(defn- archive-subtree-writable?
  "Whether the current user may write every Collection that archiving `collection` takes along, which `changes` need
  only when they archive it."
  [collection changes]
  (or (not (mi/changes-archived? collection changes))
      (not (:archived changes))
      (can-write-collection-ids? (vec (collection-ids-for-archiving collection)))))

(defmethod mi/can-update? :model/Collection
  [collection changes]
  (boolean
   (and (mi/can-write? collection)
        (if-let [new-parent (move-target collection changes)]
          (can-move-to? collection new-parent)
          true)
        (archive-subtree-writable? collection changes)
        (archive-followers-updatable? collection changes))))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *allow-modifying-tenant-root-collections?*
  "We archive tenant root collections only when the tenant is archived."
  false)

(defmacro with-allow-modifying-tenant-root-collections
  "Usually we don't allow archiving tenant specific root collections, just like personal collections. But
  if a tenant is deactivated, we should allow archiving them."
  [& body]
  `(binding [*allow-modifying-tenant-root-collections?* true]
     (do ~@body)))

(defenterprise unpublish-downstream-fk-tables!
  "When Library tables are unpublished because their collection is archived or deleted, also unpublish any tables that
  depend on them via FK remapping (Dimensions) so implicit joins are not broken. OSS no-op."
  metabase-enterprise.data-studio.api.table
  [_seed-table-ids]
  nil)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Toucan IModel & Perms Method Impls                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ----------------------------------------------------- INSERT -----------------------------------------------------

(defn archived?
  "Whether `collection`, a Collection id or the row [[content-parent]] gives, is archived, which the root, nil, never
  is."
  [collection]
  (if (map? collection)
    (boolean (:archived collection))
    (collections.db/collection-archived? collection)))

(mu/defn archived-collection-ids :- [:set ms/PositiveInt]
  "The ids among `collection-ids`, nil for the root, of the Collections that are archived, read together."
  [collection-ids :- [:maybe [:sequential [:maybe ms/PositiveInt]]]]
  (collections.db/archived-collection-ids-among (into #{} (remove nil?) collection-ids)))

(defn check-collection-not-archived
  "Throws a 400 when `row-archived?` is false and `collection`, a Collection id or the row [[content-parent]] gives, if
  any, is archived."
  [row-archived? collection]
  (when (and (not row-archived?) (archived? collection))
    (throw (ex-info (tru "You cannot put an unarchived item in an archived Collection.")
                    {:status-code 400, :errors {:collection_id (tru "archived Collection")}}))))

(defn- check-parent-not-archived
  "Throws a 400 when `row`, which is not archived, is in `parent`, which is."
  [row parent]
  (when (and parent (:archived parent) (not (:archived row)))
    (throw (ex-info (tru "You cannot put an unarchived item in an archived Collection.")
                    {:status-code 400, :errors {:location (tru "archived Collection")}}))))

(defn- check-personal-collection-at-root
  "Throws a 400 unless the `location` of `row` is the root for a Personal Collection."
  [{:keys [location personal_owner_id]}]
  (when (and personal_owner_id (not= location "/"))
    (let [msg (tru "You cannot move a Personal Collection.")]
      (throw (ex-info msg {:status-code 400, :errors {:location msg}})))))

(defn- check-valid-location
  "Throws a 400 unless the `location` of `row` is a valid path, and the root for a Personal Collection."
  [{:keys [location] :as row}]
  (when-not (valid-location-path? location)
    (let [msg (tru "Invalid Collection location: path is invalid.")]
      (throw (ex-info msg {:status-code 400, :errors {:location msg}}))))
  (check-personal-collection-at-root row))

(defn- check-ancestors-exist
  "Throws a 404 unless every Collection in the location of `row` is among `ancestors`."
  [{:keys [location]} ancestors]
  (when-not (every? ancestors (location-path->ids location))
    (let [msg (tru "Invalid Collection location: some or all ancestors do not exist.")]
      (throw (ex-info msg {:status-code 404, :errors {:location msg}})))))

(defn- parent-of
  "The Collection `row` is in, from `ancestors`, or nil for one in the root."
  [{:keys [location]} ancestors]
  (some->> location location-path->parent-id (get ancestors)))

(defn- inherited-columns
  "The `namespace`, `type` and `is_remote_synced` `row` takes from `parent`, where it leaves them unset; `type` only
  when `parent` is a section of the library."
  [row parent]
  (cond-> {}
    (and parent (nil? (:namespace row)) (:namespace parent))
    (assoc :namespace (:namespace parent))

    (and parent (nil? (:type row)) (contains? library-section-types (:type parent)))
    (assoc :type (:type parent))

    (and parent (nil? (:is_remote_synced row)))
    (assoc :is_remote_synced (boolean (:is_remote_synced parent)))))

(defn- check-namespace-columns
  "Throws a 400 for a tenant Collection when tenants are off, and for a Personal Collection outside the default
  namespace."
  [{owner-id :personal_owner_id, collection-namespace :namespace, :as row}]
  (when (and collection-namespace (shared-tenant-collection? row) (not (perms/use-tenants)))
    (throw (ex-info (tru "Can''t create a tenant collection without tenants enabled.") {:status-code 400})))
  (when (and owner-id collection-namespace)
    (let [msg (tru "Personal Collections must be in the default namespace")]
      (throw (ex-info msg {:status-code 400, :errors {:personal_owner_id msg}})))))

(defn- check-parent-namespace
  "Throws a 400 unless `row` is in the namespace of `parent`."
  [row parent]
  (when (and parent (not= (some-> (:namespace row) keyword) (some-> (:namespace parent) keyword)))
    (let [msg (tru "Collection must be in the same namespace as its parent")]
      (throw (ex-info msg {:status-code 400, :errors {:location msg}})))))

(defn- check-remote-synced-parent
  "Throws a 400 unless `row` is remote-synced exactly when `parent`, nil for the root, is."
  [row parent]
  (let [remote-synced? (boolean (:is_remote_synced row))]
    (when-not (= remote-synced? (boolean (:is_remote_synced parent)))
      (let [msg (if remote-synced?
                  (tru "A remote-synced Collection can only be placed in another remote-synced Collection or the root Collection.")
                  (tru "A Collection placed in a remote-synced Collection must also be remote-synced."))]
        (throw (ex-info msg {:status-code 400, :errors {:location msg}}))))))

(defn- check-placement
  "Throws a 400 when `parent` can't hold `row`."
  [row parent]
  (when parent
    (when (= data-apps-ns (some-> (:namespace parent) keyword))
      (check-data-app-content :collection))
    (check-library-placement (or (:type row) :collection) (:type parent))))

(defn- remote-synced-type->flag
  "`row`, an insert, with the `remote-synced` type turned into the `is_remote_synced` flag."
  [row]
  (cond-> row
    (= (:type row) "remote-synced") (-> (assoc :is_remote_synced true) (dissoc :type))))

(defn- before-insert-row
  "`row`, an insert, checked and with the columns it inherits from its parent, which `ancestors` holds."
  [row ancestors]
  (let [parent (parent-of row ancestors)
        row    (merge row (inherited-columns row parent))]
    (check-namespace-columns row)
    (check-parent-namespace row parent)
    (check-parent-not-archived row parent)
    (when parent
      (check-remote-synced-parent row parent))
    (check-placement row parent)
    row))

(t2/define-before-insert :model/Collection
  [row]
  (when (contains? row :location)
    (check-personal-collection-at-root row))
  (check-namespace-columns row)
  (assoc row :slug (slugify (:name row))))

;;; ----------------------------------------------------- UPDATE -----------------------------------------------------

(mu/defn- check-changes-allowed-for-protected-collection
  "If we're trying to UPDATE a Personal Collection or Tenant Collection, make sure the proposed changes are
  allowed. Personal Collections and TCs have lots of restrictions -- you can't archive them, for example, nor can you
  transfer them to other Users."
  [collection-before-updates :- CollectionWithLocationAndIDOrRoot
   collection-updates        :- (mut/dissoc ::collections.schema/collection.update :id)]
  ;; you're not allowed to change the `:personal_owner_id` of a Collection!
  ;; double-check and make sure it's not just the existing value getting passed back in for whatever reason
  (let [ctype        (if (:personal_owner_id collection-before-updates)
                       "Personal Collection"
                       "Tenant Collection")
        unchangeable {:personal_owner_id (tru "You are not allowed to change the owner of a {0}." ctype)
                      :authority_level   (tru "You are not allowed to change the authority level of a {0}." ctype)
                      ;; The checks below should be redundant because the `collection-ids-for-moving` and `collection-ids-for-archiving`
                      ;; functions also check to make sure you're not operating on Personal Collections. But as an extra safety net it
                      ;; doesn't hurt to check here too.
                      :location          (tru "You are not allowed to move a {0}." ctype)
                      :archived          (tru "You cannot archive a {0}." ctype)}]
    (when-let [[k msg] (->> unchangeable
                            (filter (fn [[k _msg]]
                                      (api/column-will-change? (get collection-before-updates k)
                                                               (get collection-updates k ::api/not-provided))))
                            first)]
      (throw
       (ex-info msg {:status-code 400 :errors {k msg}})))))

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

(defn- check-library-root-unchanged
  "Throws a 400 when `row`, the Collection an update with `changes` leaves, is a locked section of the library whose
  properties `changes` change."
  [row changes]
  (when (and (library-root-collection? row)
             (seq (set/intersection (set (keys changes))
                                    #{:name :description :archived :location :personal_owner_id :slug :namespace :type :authority_level :is_sample})))
    (throw (ex-info (tru "Cannot update properties on a semantic layer collection.") {:status-code 400}))))

(defn- check-library-update
  "Throws a 400 when `row`, the Collection an update with `changes` of `before` leaves, is a locked section of the
  library or leaves it, `parent` being the Collection it is in."
  [row before changes parent]
  (check-library-root-unchanged row changes)
  (when (and (contains? library-collection-types (:type before))
             (contains? changes :location)
             parent
             (not= (:type row) (:type parent)))
    (throw (ex-info (tru "Cannot move a semantic layer collection outside the semantic layer.") {:status-code 400}))))

(defn- check-update-allowed
  "Throws a 400 when `changes` can't be made to `collection-before-updates`: the Trash, a data app's collection, a
  Personal Collection or a tenant's root are fixed."
  [collection-before-updates changes]
  (api/check
   (not (is-trash? collection-before-updates))
   [400 "You cannot modify the Trash Collection."])
  (api/check
   (not (and (or (:archived changes)
                 (some? (:authority_level changes))
                 (contains? changes :location)
                 (some changes [:type :personal_owner_id :is_sample :archive_operation_id]))
             (perms/data-app-collection? collection-before-updates)))
   [400 "A data app's collection stays a top-level collection of data apps: it can't be moved, trashed, made official or given a type."])
  (when (or (:personal_owner_id collection-before-updates)
            (and (not *allow-modifying-tenant-root-collections?*)
                 (= (:type collection-before-updates) tenant-specific-root-collection-type)))
    (check-changes-allowed-for-protected-collection collection-before-updates changes)))

(defn- check-not-moved-into-itself
  "Throws a 400 when `row`, with its new location, would be in itself or one of its descendants."
  [{:keys [id location]}]
  (when (contains? (set (location-path->ids location)) id)
    (throw (ex-info (tru "You cannot move a Collection into itself or into one of its descendants.") {:status-code 400}))))

(defn- check-move
  "Throws a 400 when `row`, with its new location, would be in itself, one of its descendants or the Trash."
  [{:keys [location] :as row}]
  (check-not-moved-into-itself row)
  (when (str/starts-with? location (trash-path))
    (throw (ex-info (tru "You cannot move a Collection into the Trash.") {:status-code 400}))))

(t2/define-before-update :model/Collection
  [row]
  (let [changes (t2/changes row)
        before  (t2/original row)]
    (when (seq changes)
      (check-update-allowed before changes)
      (check-namespace-columns (merge (select-keys before [:namespace]) changes)))
    (when (contains? changes :location)
      (check-not-moved-into-itself row)
      (check-personal-collection-at-root row))
    (check-library-root-unchanged row changes)
    (when (and (contains? changes :namespace)
               (not (namespace-equals? (:namespace (t2/original row)) (:namespace changes))))
      (let [msg (tru "You cannot move a Collection to a different namespace once it has been created.")]
        (throw (ex-info msg {:status-code 400, :errors {:namespace msg}}))))
    (cond-> row
      (:name changes) (assoc :slug (slugify (:name changes))))))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(defonce ^:dynamic ^{:doc "Whether to allow deleting Personal Collections. Normally we should *never* allow this, but
  in the single case of deleting a User themselves, we need to allow this. (Note that in normal usage, Users never get
  deleted, but rather archived; thus this code is used solely by our test suite, by things such as the `with-temp`
  macros.)"}
  *allow-deleting-personal-collections*
  false)

;;; -------------------------------------------------- IModel Impl ---------------------------------------------------

(def instance-analytics-collection-type
  "The value of the `:type` field for the `instance-analytics` Collection created in [[metabase-enterprise.audit-app.audit]]"
  "instance-analytics")

(defmethod mi/non-internal-filter-clause :model/Collection
  [_model alias]
  (let [maybe-alias #(h2x/identifier :field (name alias) %)]
    [:and
     [:or [:= (maybe-alias :type) nil]
      [:and
       [:not= (maybe-alias :type) instance-analytics-collection-type]
       [:not= (maybe-alias :type) trash-collection-type]]]
     [:or [:= (maybe-alias :namespace) nil]
      [:not= (maybe-alias :namespace) "analytics"]]
     [:not (maybe-alias :is_sample)]]))

(defn- storage-paths
  "The storage path of each of the Collection `entities`, under the folder of its namespace by its hierarchy."
  [entities {:keys [collections]}]
  (mapv (fn [coll]
          (into [{:label "collections"} {:label (serialization/collection-namespace-folder (:namespace coll))}]
                (get collections (:entity_id coll))))
        entities))

(def ^:private library-stored-names
  "The names that the system-created Library collections are stored and serialized with, by entity id."
  {library-entity-id            "Library"
   library-data-entity-id       "Data"
   library-metrics-entity-id    "Metrics"
   library-dashboards-entity-id "Dashboards"})

(defn- stored-names
  "A transform fn exporting and importing the system-created Library collections with their stored names, which a select translates."
  [_store collections names _opts]
  (mapv (fn [collection collection-name] (get library-stored-names (:entity_id collection) collection-name))
        collections names))

(defn- import-parent-locations
  "A transform fn importing parent Collection entity ids as the locations of their children."
  [store _entities parent-eids opts]
  (let [parent-ids (serialization/column-ids store :model/Collection parent-eids opts)
        locations  (when-let [ids (seq (filter some? parent-ids))]
                     (collections.db/collection-locations (vec (distinct ids))))]
    (mapv #(if % (str (get locations %) % "/") "/") parent-ids)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Perms Checking Helper Fns                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn can-move?
  "Whether the current user may apply `changes` to the `:collection_id` of `row`, which asks write access to the old
  Collection and the new one, the root Collection for nil, when it changes, and is always true when it does not."
  [row changes]
  (or (not (api/column-will-change? (:collection_id row) (get changes :collection_id ::api/not-provided)))
      (and (can-write-collection-or-root? (:collection_id row) {:root-namespace nil})
           (can-write-collection-or-root? (:collection_id changes) {:root-namespace nil}))))

(defn can-move-all?
  "Whether the current user may apply `changes` to the `:collection_id` of each of `rows`, as [[can-move?]] answers for
  one, with the Collections read once and one answer for all of them: write access to the old Collections of those that
  change and to the new one. False when a Collection does not exist, which [[can-move?]] answers with a 404."
  [rows changes]
  (let [moving (filterv #(api/column-will-change? (:collection_id %) (get changes :collection_id ::api/not-provided)) rows)]
    (or (empty? moving)
        (and (can-write-all-collections-or-root? (map :collection_id moving) {:root-namespace nil})
             (can-write-all-collections-or-root? [(:collection_id changes)] {:root-namespace nil})))))

(defmulti allowed-namespaces
  "Set of Collection namespaces (as keywords) that instances of this model are allowed to go in. By default, only the
  default namespace (namespace = `nil`)."
  {:arglists '([model])}
  t2.protocols/dispatch-value)

(def default-allowed-namespaces
  "The Collection namespaces most models may go in: the default namespace and the ones that hold the same content."
  #{nil :analytics :shared-tenant-collection :tenant-specific})

(defmethod allowed-namespaces :default
  [_]
  default-allowed-namespaces)

(defmulti namespace-allowed?
  "Whether instances of `model` are allowed to go in a Collection of `collection-namespace`, a keyword or nil. By
  default, when `collection-namespace` is one of the [[allowed-namespaces]] of the model."
  {:arglists '([model collection-namespace])}
  (fn [model _collection-namespace]
    (t2.protocols/dispatch-value model)))

(defmethod namespace-allowed? :default
  [model collection-namespace]
  (contains? (allowed-namespaces model) collection-namespace))

(defmethod namespace-allowed? :model/Collection
  [_ _]
  true)

(defn check-collection-namespace
  "Check that object's `:collection_id` refers to a Collection in an allowed namespace (see
  `allowed-namespaces`), or throw an Exception.

    ;; Cards can only go in Collections in the default namespace (namespace = nil)
    (check-collection-namespace Card new-collection-id)

  `collection` is a Collection id or the row [[content-parent]] gives."
  [model collection]
  (when collection
    (let [collection           (if (map? collection) collection (content-parent collection))
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
                               :collection-namespace collection-namespace
                               :response/keys        #{:allowed-namespaces :collection-namespace}})))))))

(defn check-collection-for
  "Throws unless the Collection of `row`, if any, can hold `model`, is in an allowed namespace, and is not archived
  unless `row` is."
  [model {:keys [collection_id archived]}]
  (when-let [parent (content-parent collection_id)]
    (check-allowed-content model parent)
    (check-collection-namespace model parent)
    (check-collection-not-archived archived parent)))

(def ^:private blocked-content-types
  "The `:type` of the Collections that hold no ordinary content, which a check of the content put in a Collection looks
  at: the library, its Data and its Metrics."
  [library-collection-type library-data-collection-type library-metrics-collection-type])

(defn check-collections-for-model!
  "Throws, for the first of `rows`, each holding `:collection_id` and `:archived`, whose Collection cannot hold a `model`,
  as [[check-collection-for]] does: in one query for the Collections that are archived, in a namespace `model` does not
  go in, or the library, its Data or its Metrics, and only those are checked, in the order of `rows`."
  [model rows]
  (let [ids      (into [] (comp (keep :collection_id) (distinct)) rows)
        problems (when (seq ids)
                   (u/index-by :id (collections.db/collections-outside-content-rules
                                    ids (allowed-namespaces model) blocked-content-types)))]
    (doseq [{:keys [collection_id archived]} rows
            :let                             [parent (get problems collection_id)]
            :when                            parent]
      (check-allowed-content model parent)
      (check-collection-namespace model parent)
      (check-collection-not-archived archived parent))))

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
                                 (collections.db/collection-archived-flags parent-ids))
          ;; Batch: get all descendants for all archive_operation_ids
          op-ids (keep :archive_operation_id archived-colls)
          all-descendants (when (seq op-ids)
                            (collections.db/archived-collections-in-operations op-ids))
          op-id->descendant-ids (update-vals (group-by :archive_operation_id all-descendants)
                                             #(map :id %))
          writable-ids (visible-collection-ids (concat (map u/the-id archived-colls) (map :id all-descendants))
                                               :write)]
      (for [coll colls
            :let [parent-id (coll-id->parent-id (:id coll))
                  archived-directly? (:archived_directly coll)
                  parent-archived? (get parent-id->archived? parent-id false)
                  descendant-ids (get op-id->descendant-ids (:archive_operation_id coll) [])]]
        (assoc coll :can_restore (boolean (and (:archived coll)
                                               archived-directly?
                                               (not parent-archived?)
                                               (every? writable-ids (cons (u/the-id coll) descendant-ids)))))))))

(defmethod hydrate-can-restore :default [_model items]
  (let [hydrated-root (delay (t2/hydrate root-collection :can_write))]
    (for [[{collection :collection} item] (map vector (t2/hydrate items [:collection :can_write]) items)]
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
                                 (mi/can-write? (or collection @hydrated-root))))))))

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
    (let [can-write (into {}
                          (mapcat (fn [[model items]]
                                    (map (juxt (juxt (constantly model) :id) :can_write)
                                         (t2/hydrate items :can_write))))
                          (group-by t2/model (remove collection.root/is-root-collection? items)))]
      (for [item items]
        (assoc item :can_delete (boolean (and
                                          (not (collection.root/is-root-collection? item))
                                          (or (not (= :model/Collection (t2/model item)))
                                              api/*is-superuser?*)
                                          (:archived item)
                                          (get can-write [(t2/model item) (:id item)]))))))))

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(defn is-library-collection?
  "Return true if the given collection ID corresponds to a collection in the library."
  [collection-id]
  (when collection-id
    (pos-int? (collections.db/collection-count-of-types collection-id (vec library-collection-types)))))

(defn collections-in-namespace
  "Return all collections in the given namespace."
  [namespace]
  (collections.db/collections-in-namespace (name namespace)))

;;; ---------------------------------------------- SerDes dependencies -------------------------------------------------

(defn- import-dependencies
  "The parent Collection each of the Collection `entities` depends on, if any."
  [entities]
  (mapv (fn [{:keys [parent_id]}]
          (when parent_id
            #{[:model/Collection parent_id]}))
        entities))

(defn- export-dependencies
  "The parent Collection each of the `collections` depends on, if any."
  [collections]
  (mapv (fn [{:keys [location]}]
          (when-let [parent-id (some-> location location-path->parent-id)]
            #{[:model/Collection parent-id]}))
        collections))

(defn- export-parent-ids
  "Exports the `location` of each Collection as the entity id of its parent."
  [store _collections locations _opts]
  (serialization/column-refs store :model/Collection (map location-path->parent-id locations)))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defmulti archive-in-collections!
  "Archives the rows of `model` in the Collections with `collection-ids` along with them, which a model that follows its
  Collection implements with its own write function, giving it `opts` for its write function."
  {:arglists '([model collection-ids opts])}
  (fn [model _collection-ids _opts] model))

(defmulti restore-in-collections!
  "Restores the rows of `model` in the Collections with `collection-ids` that were archived along with them, which a
  model that follows its Collection implements with its own write function."
  {:arglists '([model collection-ids opts])}
  (fn [model _collection-ids _opts] model))

(defmulti delete-in-collections!
  "Deletes the rows of `model` in the Collections with `collection-ids`, which a model that follows its Collection
  implements with its own write function."
  {:arglists '([model collection-ids opts])}
  (fn [model _collection-ids _opts] model))

(defn- not-a-follower
  "Throws that `model` does not follow its Collection in the way asked."
  [model]
  (throw (ex-info (format "%s does not follow its Collection in this way" model) {:model model})))

(defmethod archive-in-collections! :default [model _collection-ids _opts] (not-a-follower model))

(defmethod restore-in-collections! :default [model _collection-ids _opts] (not-a-follower model))

(defmethod delete-in-collections! :default [model _collection-ids _opts] (not-a-follower model))

(defmulti shift-positions-in-collection!
  "Adds one to, or subtracts one from, the `collection_position` of the rows of `model` in the Collection with
  `collection-id` whose position is in `positions`, `{:from n :to m}` with either bound left out, as `direction`, `:+` or
  `:-`, says, and returns the number updated, which a model that has a position in its Collection implements with its own
  write function."
  {:arglists '([model collection-id positions direction])}
  (fn [model _collection-id _positions _direction] model))

(def ^:private positioned-models
  "The models whose rows have a position in their Collection."
  [:model/Card :model/Dashboard :model/Pulse :model/Document])

(defn position-clause
  "The HoneySQL condition on `collection_position` for `positions`, `{:from n :to m}` with either bound left out, which
  is any position when both are."
  [{:keys [from to]}]
  (cond
    (and from to) [:between from to]
    from          [:>= from]
    to            [:<= to]
    :else         [:not= nil]))

(defn- shift-positions!
  "Shifts the positions in `positions` of each of [[positioned-models]] in the Collection with `collection-id` by one."
  [collection-id positions direction]
  (doseq [model positioned-models]
    (t2/resolve-model model)
    (shift-positions-in-collection! model collection-id positions direction)))

(mu/defn reconcile-position-for-collection!
  "Compare `old-position` and `new-position` to determine what needs to be updated based on the position change. Used
  for fixing card/dashboard/pulse changes that impact other instances in the collection"
  [collection-id :- [:maybe ms/PositiveInt]
   old-position  :- [:maybe ms/PositiveInt]
   new-position  :- [:maybe ms/PositiveInt]]
  (when (not= new-position old-position)
    (cond
      (and (nil? new-position)
           old-position)
      (shift-positions! collection-id {:from (inc old-position)} :-)

      (and new-position (nil? old-position))
      (shift-positions! collection-id {:from new-position} :+)

      (> new-position old-position)
      (shift-positions! collection-id {:from old-position :to new-position} :-)

      (< new-position old-position)
      (shift-positions! collection-id {:from new-position :to old-position} :+))))

(def ^:private ModelWithPosition
  "Intended to cover Cards/Dashboards/Pulses, it only asserts collection id and position, allowing extra keys"
  [:map {:closed true}
   [:collection_id       [:maybe ms/PositiveInt]]
   [:collection_position [:maybe ms/PositiveInt]]])

(def ^:private ModelWithOptionalPosition
  "Intended to cover Cards/Dashboards/Pulses updates. Collection id and position are optional, if they are not
  present, they didn't change. If they are present, they might have changed and we need to compare."
  [:map {:closed true}
   [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]])

(mu/defn maybe-reconcile-collection-position!
  "Generic function for working on cards/dashboards/pulses. Checks the before and after changes to see if there is any
  impact to the collection position of that model instance. If so, executes updates to fix the collection position
  that goes with the change. The 2-arg version of this function is used for a new card/dashboard/pulse (i.e. not
  updating an existing instance, but creating a new one)."
  ([new-model-data :- ModelWithOptionalPosition]
   (maybe-reconcile-collection-position! nil new-model-data))
  ([{old-collection-id :collection_id, old-position :collection_position, :as _before-update} :- [:maybe ModelWithPosition]
    {new-collection-id :collection_id, new-position :collection_position, :as model-updates} :- ModelWithOptionalPosition]
   (let [updated-collection? (and (contains? model-updates :collection_id)
                                  (not= old-collection-id new-collection-id))
         updated-position?   (and (contains? model-updates :collection_position)
                                  (not= old-position new-position))]
     (cond
       (and (not updated-collection?) updated-position?)
       (reconcile-position-for-collection! old-collection-id old-position new-position)

       (and updated-collection? (not updated-position?))
       (do
         (reconcile-position-for-collection! old-collection-id old-position nil)
         (reconcile-position-for-collection! new-collection-id nil old-position))

       (and updated-collection? updated-position?)
       (do
         (reconcile-position-for-collection! old-collection-id old-position nil)
         (reconcile-position-for-collection! new-collection-id nil new-position))))))

(defn item-ids-to-archive
  "The ids of the `model` rows in the Collections with `collection-ids` that archiving them archives along with them."
  [model collection-ids]
  (if (= model :model/Pulse)
    (collections.db/pulse-ids-archived-with-collections (vec collection-ids))
    (collections.db/item-ids-archived-with-collections model (vec collection-ids))))

(defn item-ids-to-restore
  "The ids of the `model` rows in the Collections with `collection-ids` that were archived along with them and come back
  when they do."
  [model collection-ids]
  (if (= model :model/Pulse)
    (collections.db/pulse-ids-restored-with-collections (vec collection-ids))
    (collections.db/item-ids-restored-with-collections model (vec collection-ids))))

(defn item-ids-in-collections
  "The ids of the `model` rows, a Card, Dashboard or Pulse, in the Collections with `collection-ids`."
  [model collection-ids]
  (let [ids (vec collection-ids)]
    (case model
      :model/Card      (collections.db/card-ids-in-collections ids)
      :model/Dashboard (collections.db/dashboard-ids-in-collections ids)
      :model/Pulse     (collections.db/pulse-ids-in-collections ids))))

(defn- each-follower!
  "Calls `multi` for each of `models`, in order, with `collection-ids` and `opts`, after loading the model."
  [multi models collection-ids opts]
  (doseq [model models]
    (t2/resolve-model model)
    (multi model collection-ids opts)))

(def ^:private archive-followers
  "The models that archive with their Collection, in the order they follow it: Cards before the Dashboards and Documents
  that carry the Cards they hold."
  [:model/Card :model/Dashboard :model/Document :model/Exploration :model/Timeline :model/NativeQuerySnippet
   :model/Pulse :model/Action])

(def ^:private restore-followers
  "The models that restore with their Collection, in the order they follow it: Dashboards, Explorations and Documents
  before the Cards and Documents they hold."
  [:model/Dashboard :model/Exploration :model/Document :model/Timeline :model/NativeQuerySnippet :model/Card
   :model/Pulse :model/Action])

(def ^:private delete-followers
  "The models that are deleted with their Collection, in order."
  [:model/Card :model/Dashboard :model/NativeQuerySnippet :model/Pulse :model/Timeline :model/Action])

(def ^:private unpublish-followers
  "The models that unpublish the Tables of a Collection that is archived or deleted, in order."
  [:model/TableUserSettings :model/Table])

(defn- unpublish-tables!
  "Unpublishes the Tables in the Collections with `collection-ids`, in their user settings too, and the Tables that
  depend on them."
  [collection-ids opts]
  (when-let [table-ids (not-empty (collections.db/published-table-ids-in-collections collection-ids))]
    (each-follower! archive-in-collections! unpublish-followers (vec collection-ids) opts)
    (unpublish-downstream-fk-tables! table-ids)))

(defn- archive-followers!
  "Archives what is in the Collections with `collection-ids` along with them, each kind with one call, and unpublishes
  the Tables of their library Data collections."
  [collection-ids opts]
  (each-follower! archive-in-collections! archive-followers (vec collection-ids) opts)
  (when-let [library-data-ids (not-empty (collections.db/collection-ids-of-type (vec collection-ids) library-data-collection-type))]
    (unpublish-tables! library-data-ids opts)))

(defn- restore-followers!
  "Restores what was archived along with the Collections with `collection-ids` and is in them, each kind with one call,
  those that hold others before them."
  [collection-ids opts]
  (each-follower! restore-in-collections! restore-followers (vec collection-ids) opts))

(defn- delete-followers!
  "Deletes what is in the Collections with `collection-ids`, each kind with one call, after unpublishing their Tables."
  [collection-ids]
  (unpublish-tables! collection-ids nil)
  (each-follower! delete-in-collections! delete-followers (vec collection-ids) nil))

(defn- permission-objects
  "The read and read-write permission paths of the Collections with `collection-ids`."
  [collection-ids]
  (vec (for [id        collection-ids
             path-fn   [perms/collection-read-path perms/collection-readwrite-path]]
         (path-fn id))))

(defn- copy-collection-permissions!
  "Grants each target Collection of `source+targets`, the pairs `[source target-id]`, the permissions of its source, a
  Collection, an id or the root, to every group with read permissions for the source, and write permissions for
  every group with write permissions for it, and records a new revision of the permission graph."
  [source+targets]
  (when (seq source+targets)
    (let [groups (collections.db/group-ids-by-permission-object
                  (vec (into #{} (mapcat (fn [[source _]] [(perms/collection-read-path source)
                                                           (perms/collection-readwrite-path source)]))
                             source+targets)))]
      (when-let [rows (not-empty
                       (vec (for [[source target] source+targets
                                  path-fn         [perms/collection-read-path perms/collection-readwrite-path]
                                  group-id        (get groups (path-fn source))]
                              {:group_id group-id, :object (path-fn target)})))]
        (permissions/create-permissions! rows))
      (perms/increment-implicit-perms-revision! :model/CollectionPermissionGraphRevision
                                                "Automatically updated permissions due to collection creation or move"))))

(defn- personal-or-descendant?
  "Whether `collection` is a Personal Collection or in one, `personal-ids` holding the personal Collections among the
  first ones of the locations."
  [personal-ids {:keys [personal_owner_id location]}]
  (boolean (or personal_owner_id
               (some->> location location-path->ids first (contains? personal-ids)))))

(defn- first-location-ids
  "The ids of the top-level Collections that the locations of `collections` start with."
  [collections]
  (into #{} (keep #(some-> (:location %) location-path->ids first)) collections))

(defn- copy-parent-permissions!
  "Copies the permissions of its parent, or of the root Collection, to each of `collections`, the new Collections, but
  those in the Trash and the Personal Collections and what is in them, which have none."
  [collections]
  (let [personal-ids (collections.db/personal-collection-ids-among (first-location-ids collections))]
    (copy-collection-permissions!
     (for [{:keys [id location], collection-namespace :namespace, :as collection} collections
           :when (not (or (personal-or-descendant? personal-ids collection)
                          (is-trash-or-descendant? collection)))]
       [(or (location-path->parent-id location) (assoc root-collection :namespace collection-namespace))
        id]))))

(defn- ancestors-of
  "The Collections the locations of `rows` pass through, by id."
  [rows]
  (let [ids (into #{} (comp (keep :location) (mapcat location-path->ids)) rows)]
    (if (seq ids)
      (collections.db/collection-columns-by-id [:id :namespace :type :is_remote_synced :archived] (vec ids))
      {})))

(defn- check-owners-not-api-keys
  "Throws when a Personal Collection of `rows` would belong to an API key, which a production instance never reaches."
  [rows]
  (when-not config/is-prod?
    (when-let [owner-ids (not-empty (into #{} (keep :personal_owner_id) rows))]
      (when-let [user-id (first (collections.db/api-key-user-ids owner-ids))]
        (throw (ex-info "Can't create a personal collection for an API key" {:user user-id}))))))

(defn- check-single-library-rows
  "Throws a 400 when `rows`, new Collections, hold a second Collection of the library type."
  [rows]
  (when-let [library-rows (seq (filter #(= library-collection-type (:type %)) rows))]
    (when (or (next library-rows) (seq (collections.db/collection-ids-with-type library-collection-type)))
      (throw (ex-info (tru "Semantic layer already exists") {:status-code 400})))))

(defn- check-transforms-folder-not-archived
  "Throws a 400 when `row`, with the columns of its stored Collection `stored`, if any, archives a transforms folder,
  which an export from an older version can bring back."
  [row stored]
  (let [row (merge stored row)]
    (when (and (:archived row)
               (= transforms-ns (some-> (:namespace row) keyword)))
      (throw (ex-info (tru "Transforms folder \"{0}\" is archived and cannot be imported. Delete it in the source, or unarchive it there, and export again."
                           (:name row))
                      {:status-code 400
                       :entity_id   (:entity_id row)})))))

(mr/def ::write-opts
  "The options of a write function of Collections: who writes."
  [:maybe [:map {:closed true}
           [:writer {:optional true} [:enum :import]]]])

(defn- check-collection-creates
  "Throw unless every one of `rows`, new Collections with the `ancestors` they read, satisfies these rules:

  - a Collection with a location goes to a valid location whose ancestors exist
  - at most one Collection is the library
  - a personal Collection is not owned by an API key"
  [rows ancestors opts]
  (when (= :import (:writer opts))
    (run! #(check-transforms-folder-not-archived % nil) rows))
  (let [located (filterv #(contains? % :location) rows)]
    (run! check-valid-location located)
    (run! #(check-ancestors-exist % ancestors) located))
  (check-single-library-rows rows)
  (check-owners-not-api-keys rows))

(defn- insert-collections!
  "Inserts `rows`, the checked new Collections of one batch, with the `ancestors` they read, gives them the permissions of
  their parent, and returns the new Collections."
  [rows ancestors]
  (u/prog1 (collections.db/insert-collections! (mapv #(before-insert-row % ancestors) rows))
    (copy-parent-permissions! <>)))

(defn- create-collection-batch!
  "Checks and inserts the Collections of `batch`, up to one partition of the call, and returns the new ones."
  [batch opts]
  (let [rows      (mapv remote-synced-type->flag batch)
        ancestors (ancestors-of (filterv #(contains? % :location) rows))]
    (check-collection-creates rows ancestors opts)
    (insert-collections! rows ancestors)))

(mu/defn create-collections! :- [:sequential (ms/InstanceOf :model/Collection)]
  "Creates a Collection from each of `rows` and returns the new Collections in order, in one transaction, publishing
  their create event. An import, `:writer :import` in `opts`, does not bring back an archived transforms folder."
  ([rows :- [:sequential ::collections.schema/collection.create]]
   (create-collections! rows nil))
  ([rows :- [:sequential ::collections.schema/collection.create]
    opts :- ::write-opts]
   (t2/with-transaction [_conn]
     (let [created (into [] (mapcat #(create-collection-batch! % opts))
                         (partition-all mdb/create-partition-size rows))]
       (when (seq created)
         (events/publish-event! :event/collection-create (events/create-event created opts)))
       created))))

(defn- same-value?
  "Whether `a` and `b` are the same value of the column `k`, a keyword and its name being the same."
  [k a b]
  (if (contains? #{:namespace :authority_level} k)
    (= (some-> a name) (some-> b name))
    (= a b)))

(defn- changing-values
  "The entries of `row`, an `:id` and columns, that change `stored`."
  [stored row]
  (into {}
        (keep (fn [[k v]]
                (when (and (not= k :id) (not (same-value? k (get stored k) v)))
                  [k v])))
        row))

(defn- normalize-update
  "`row`, an update of the stored Collection `stored`, with the `remote-synced` type turned into the flag and `archived`
  a boolean."
  [row stored]
  (cond-> row
    (= (:type row) "remote-synced") (-> (assoc :is_remote_synced true) (assoc :type (:type stored)))
    (some? (:archived row))         (update :archived boolean)))

(defn- update-entry
  "The update `row` of the stored Collection `stored` as `{:row row :before stored :changes changes}`."
  [stored row]
  (let [row (normalize-update row stored)]
    {:row row, :before stored, :changes (changing-values stored row)}))

(defn- merged
  "The Collection of `entry`, an update entry, as the update leaves it."
  [{:keys [before changes]}]
  (t2/instance :model/Collection (merge before changes)))

(defn- parent-ids-to-read
  "The ids of the Collections that the checks of the update `entries` read: all those a moved Collection passes through,
  and the parent of one that changes what it depends on."
  [entries]
  (into #{}
        (mapcat (fn [{:keys [changes] :as entry}]
                  (let [{:keys [location]} (merged entry)]
                    (cond
                      (contains? changes :location)
                      (location-path->ids location)

                      (some #(contains? changes %) [:is_remote_synced :type :archived])
                      (some-> location location-path->parent-id vector)))))
        entries))

(defn- check-single-library-update
  "Throws a 400 when the update `entries` make a Collection of the library type a second one."
  [entries]
  (when-let [becoming (not-empty (into #{} (comp (filter #(and (contains? (:changes %) :type)
                                                               (= library-collection-type (:type (merged %)))))
                                                 (map (comp :id :before)))
                                       entries))]
    (let [existing (set (collections.db/collection-ids-with-type library-collection-type))
          all      (into existing becoming)]
      (when (some #(seq (disj all %)) becoming)
        (throw (ex-info (tru "Semantic layer already exists") {:status-code 400}))))))

(defn- remote-synced-columns
  "The `is_remote_synced` a move gives `row`, the Collection an update with `changes` leaves, from `parent`, the
  Collection it is in, checking a change of the flag alone against it."
  [row changes parent]
  (cond
    (contains? changes :location)
    (do (when (contains? changes :is_remote_synced)
          (check-remote-synced-parent row parent))
        {:is_remote_synced (boolean (:is_remote_synced parent))})

    (and parent (contains? changes :is_remote_synced))
    (do (check-remote-synced-parent row parent)
        nil)))

(defn- archived-columns
  "The `archived_directly` and `archive_operation_id` that a change of `archived` gives `row`, the Collection an update
  with `changes` leaves, in `parent`: a write that carries an archive operation is the cascade of an archive and gives
  an inherited archive, and one that archives on its own gets `operation-id`."
  [row changes parent operation-id]
  (let [directly (cond
                   (contains? changes :archived_directly) (:archived_directly changes)
                   (and (:archived row) (some? (:archive_operation_id changes))) false
                   :else (boolean (and (:archived row) (not (:archived parent)))))]
    (cond-> {:archived_directly directly}
      (not (contains? changes :archive_operation_id))
      (assoc :archive_operation_id (when (and (:archived row) directly) operation-id)))))

(defn- operation-ids
  "A map from the id of each of the update `entries` that archives its Collection to the id of the archive operation it
  starts: the Collections that archive together and are not under one another share one, so that restoring one brings
  back what its archive took down and nothing of another operation, with one id for each depth of Collections under
  others that archive."
  [entries]
  (let [archiving (filterv #(:archived (:changes %)) entries)
        by-depth  (zipmap (range (inc (count archiving))) (repeatedly #(str (random-uuid))))]
    (into {}
          (map (fn [entry]
                 (let [location (:location (merged entry))
                       depth    (count (filter (fn [other]
                                                 (and (not= (:id (:before other)) (:id (:before entry)))
                                                      location
                                                      (str/starts-with? location (children-location (:before other)))))
                                               archiving))]
                   [(:id (:before entry)) (get by-depth depth)])))
          archiving)))

(defn- update-columns
  "The columns to write for `entry`, an update entry, after checking that its changes can be made, `ancestors` holding
  the Collections it passes through, and `operation-id` the archive operation it starts when it archives."
  [{:keys [before changes] :as entry} ancestors operation-id]
  (let [row    (merged entry)
        moved? (contains? changes :location)
        parent (parent-of row ancestors)]
    (check-update-allowed before changes)
    (when moved?
      (check-move row))
    (check-namespace-columns (merge (select-keys before [:namespace]) changes))
    (when moved?
      (check-parent-namespace row parent)
      (check-parent-not-archived row parent))
    (when (or moved? (contains? changes :type))
      (check-placement row parent))
    (check-library-update row before changes parent)
    (merge changes
           (remote-synced-columns row changes parent)
           (when (:name changes) {:slug (slugify (:name changes))})
           (when (contains? changes :archived) (archived-columns row changes parent operation-id)))))

(defn- update-permissions-of-moves!
  "Adjusts the permissions of the moved update `entries`: a Collection that leaves a Personal Collection gets those of
  its new parent, with what is under it, one that moves into one loses its own, and one that crosses the tenant
  namespace boundary gets what EE gives it."
  [entries ancestors]
  (let [personal-ids (collections.db/personal-collection-ids-among
                      (first-location-ids (into [] (mapcat (juxt :before merged)) entries)))
        crossing     (filterv #(not= (personal-or-descendant? personal-ids (:before %))
                                     (personal-or-descendant? personal-ids (merged %)))
                              entries)
        below        (when (seq crossing)
                       (collections.db/collections-below (mapv (comp children-location :before) crossing)))
        subtree-ids  (fn [{:keys [before]}]
                       (let [prefix (children-location before)]
                         (cons (:id before)
                               (into [] (comp (filter #(str/starts-with? (:location %) prefix)) (map :id)) below))))]
    (copy-collection-permissions!
     (for [entry  crossing
           :when  (personal-or-descendant? personal-ids (:before entry))
           :let   [row (merged entry)
                   source (or (some->> (:location row) location-path->parent-id (get ancestors)) root-collection)]
           target (subtree-ids entry)]
       [source target]))
    (when-let [objects (not-empty (vec (mapcat (comp permission-objects subtree-ids)
                                               (remove #(personal-or-descendant? personal-ids (:before %)) crossing))))]
      (permissions/delete-permissions-for-objects! objects))
    (doseq [{:keys [before changes]} entries]
      (update-perms-for-tenant-specific-namespace-change! before changes))))

(defn- move-descendants!
  "Moves the Collections under the moved update `entries` with them, giving them the `is_remote_synced` of the columns
  to write, `columns-by-id`, but not the Collections of `entries` themselves, in one statement."
  [entries columns-by-id]
  (collections.db/move-descendant-collections!
   (mapv (fn [entry]
           {:old-location    (children-location (:before entry))
            :new-location    (children-location (merged entry))
            :remote-synced?  (boolean (:is_remote_synced (get columns-by-id (:id (:before entry)))))})
         entries)
   (mapv (comp :id :before) entries)))

(defn- publish-carried-updates!
  "Publish the update event of the Collections `rows`, as the `changes` that the archive or restore of the Collection
  `root-id` made to them."
  [rows changes root-id]
  (events/publish-event! :event/collection-update
                         (events/update-event (into {} (map (juxt :id identity)) rows)
                                              (mapv #(assoc changes :id (:id %)) rows)
                                              {:context {:archived-with [:model/Collection root-id]}})))

(defn- archive-subtrees!
  "Archives the Collections under the update `entries`, which archive their Collection on its own, with the archive
  operation of the Collection above them, and what is in all of them, publishing the update event of those Collections
  as carried by the archive of `carrier-id`."
  [entries columns-by-id carrier-id]
  (let [roots     (mapv (fn [entry]
                          (assoc entry :operation-id (:archive_operation_id (get columns-by-id (:id (:before entry))))))
                        entries)
        below     (collections.db/unarchived-collections-below (mapv (comp children-location :before) roots))
        nearest   (fn [{:keys [location]}]
                    (->> roots
                         (filter #(str/starts-with? location (children-location (:before %))))
                         (sort-by (comp - count children-location :before))
                         first))
        by-root   (group-by (comp :id :before nearest) below)]
    (doseq [[root-id descendants] by-root
            :let [operation-id (:operation-id (first (filter #(= root-id (:id (:before %))) roots)))
                  changes      {:archived true, :archive_operation_id operation-id, :archived_directly false}]]
      (collections.db/update-collections! (mapv :id descendants) changes)
      (publish-carried-updates! descendants changes carrier-id))
    (archive-followers! (into (mapv (comp :id :before) roots) (map :id) below)
                        {:context {:archived-with [:model/Collection carrier-id]}})))

(defn- restore-subtrees!
  "Restores the Collections under the update `entries`, which restore their Collection, that the archive of their
  Collection took down, and what is in all of them, publishing the update event of those Collections as carried by the
  restore of `carrier-id`."
  [entries carrier-id]
  (let [below (collections.db/restorable-collections-below
               (into [] (keep (fn [{:keys [before]}]
                                (when-let [operation-id (:archive_operation_id before)]
                                  [(children-location before) operation-id])))
                     entries))]
    (when (seq below)
      (let [changes {:archived false, :archive_operation_id nil}]
        (collections.db/update-collections! (mapv :id below) changes)
        (publish-carried-updates! below changes carrier-id)))
    (restore-followers! (into (mapv (comp :id :before) entries) (map :id) below)
                        {:context {:archived-with [:model/Collection carrier-id]}})))

(defn- publish-update!
  "Publish the update event of the Collections of `entries`, update entries, as the `columns` written for each leave
  them, by the writer of `opts`."
  [entries columns opts]
  (events/publish-event! :event/collection-update
                         (events/update-event (into {} (map (juxt (comp :id :before) :before)) entries)
                                              (mapv (fn [{:keys [before]} cols] (assoc cols :id (:id before)))
                                                    entries columns)
                                              opts)))

(defn- check-collection-updates
  "Throw unless every one of `entries`, updates of the stored Collections with the `ancestors` they read, satisfies these
  rules:

  - a Collection that moves goes to a valid location whose ancestors exist
  - at most one Collection becomes the library"
  [entries ancestors]
  (let [moved (filterv #(contains? (:changes %) :location) entries)]
    (run! #(check-valid-location (merged %)) moved)
    (run! #(check-ancestors-exist (merged %) ancestors) moved)
    (check-single-library-update entries)))

(defn- write-collection-updates!
  "Writes `entries`, updates of the stored Collections, with the `ancestors` they read: their permissions, their columns,
  the archive or restore of what is under them and the move of their descendants, and returns the columns written for
  each."
  [entries ancestors]
  (let [moved      (filterv #(contains? (:changes %) :location) entries)
        operations (operation-ids entries)
        columns    (mapv #(update-columns % ancestors (get operations (:id (:before %)))) entries)
        by-id      (zipmap (map (comp :id :before) entries) columns)]
    (when (seq moved)
      (update-permissions-of-moves! moved ancestors))
    (collections.db/update-collections-by-columns! (mapv (fn [entry cols] [(:id (:before entry)) cols]) entries columns))
    (let [archiving (filterv #(and (:archived (:changes %)) (:archived_directly (get by-id (:id (:before %))))) entries)
          restoring (filterv #(and (contains? (:changes %) :archived)
                                   (not (:archived (:changes %)))
                                   (or (:archived_directly (:before %))
                                       (not (contains? (:row %) :archive_operation_id))))
                             entries)]
      (when-let [roots (seq (concat archiving restoring))]
        (let [root-id (:id (:before (first roots)))]
          (when (seq archiving)
            (archive-subtrees! archiving by-id root-id))
          (when (seq restoring)
            (restore-subtrees! restoring root-id)))))
    (when (seq moved)
      (move-descendants! moved by-id)
      (doseq [{:keys [before]} moved]
        (events/publish-event! :event/collection-touch {:collection-id (:id before) :user-id api/*current-user-id*})))
    columns))

(defn- update-collection-batch!
  "Checks and writes the Collections of `batch`, up to one partition of the call, and returns what the event needs."
  [batch opts]
  (let [stored  (collections.db/collections-by-id (mapv :id batch))
        _       (when (= :import (:writer opts))
                  (run! #(check-transforms-folder-not-archived % (get stored (:id %))) batch))
        rows    (cond->> (filterv #(contains? stored (:id %)) batch)
                  (= :import (:writer opts))
                  (mapv #(cond-> % (system-collection-name (get stored (:id %))) (dissoc :name))))
        entries (into [] (comp (map #(update-entry (get stored (:id %)) %))
                               (filter (comp seq :changes)))
                      rows)
        parent-ids (parent-ids-to-read entries)
        ancestors  (if (seq parent-ids)
                     (collections.db/collection-columns-by-id [:id :namespace :type :is_remote_synced :archived]
                                                              (vec parent-ids))
                     {})]
    (check-collection-updates entries ancestors)
    {:rows rows :entries entries :columns (write-collection-updates! entries ancestors)}))

(mu/defn update-collections! :- [:sequential ::collections.schema/collection.update]
  "Applies the columns of each of `updates` to the Collection with its `:id` and returns those of Collections that
  exist, in one transaction, publishing their update event. An import, `:writer :import` in `opts`, keeps the names of
  the system Collections and does not bring back an archived transforms folder."
  ([updates :- [:sequential ::collections.schema/collection.update]]
   (update-collections! updates nil))
  ([updates :- [:sequential ::collections.schema/collection.update]
    opts    :- ::write-opts]
   (t2/with-transaction [_conn]
     (let [batches (mapv #(update-collection-batch! % opts) (partition-all mdb/update-partition-size updates))
           entries (into [] (mapcat :entries) batches)]
       (when (seq entries)
         (publish-update! entries (into [] (mapcat :columns) batches) opts))
       (into [] (mapcat :rows) batches)))))

(defn- check-deletable
  "Throws unless the stored Collection `collection` may be deleted."
  [{:keys [personal_owner_id] :as collection}]
  (when (= (u/the-id collection) (trash-collection-id))
    (throw (ex-info "Fatal error: the trash collection cannot be trashed" {})))
  (when-not *allow-deleting-personal-collections*
    (when personal_owner_id
      (throw (Exception. (tru "You cannot delete a Personal Collection!"))))))

(defn- check-collection-deletes
  "Throw unless every one of `collections` satisfies these rules:

  - it is not the Trash
  - it is not a personal Collection, unless deleting those is allowed"
  [collections]
  (run! check-deletable collections))

(defn- delete-collection-batch!
  "Deletes the Collections with the ids of `batch`, which hold the Collections under them, with what depends on them."
  [ids]
  (delete-followers! ids)
  (permissions/delete-permissions-for-objects! (permission-objects ids))
  (collections.db/delete-collections! ids))

(mu/defn delete-collections! :- :nil
  "Deletes the Collections with `collection-ids`, the Collections under them, what is in all of them and their
  permissions in one transaction, publishing their delete event right before the first statement."
  [collection-ids :- [:sequential ms/PositiveInt]]
  (t2/with-transaction [_conn]
    (let [stored (into {} (mapcat #(collections.db/collections-by-id (vec %)))
                       (partition-all mdb/delete-partition-size (distinct collection-ids)))]
      (check-collection-deletes (vals stored))
      (when (seq stored)
        (let [ids     (into (set (keys stored))
                            (map :id)
                            (collections.db/collections-below (mapv children-location (vals stored))))
              batches (partition-all mdb/delete-partition-size ids)]
          (events/publish-event! :event/collection-delete
                                 (events/delete-event (into [] (mapcat #(vals (collections.db/collections-by-id (vec %)))) batches)))
          (run! #(delete-collection-batch! (vec %)) batches)))))
  nil)

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Collection [_model]
  {:skip? false})

(defmethod serialization/spec :model/Collection [_]
  {:schema              ::collections.schema/external-collection
   :copy                [:archive_operation_id :archived :archived_directly :authority_level :description :entity_id
                         :is_remote_synced :is_sample :namespace :slug :type]
   :transform           {:name              {:export stored-names
                                             :import stored-names}
                         :location          {:as     :parent_id
                                             :export export-parent-ids
                                             :import import-parent-locations}
                         :personal_owner_id serialization/user-transform}
   :defaults            {:archived         false
                         :is_sample        false
                         :is_remote_synced false}
   :storage-paths       storage-paths
   :import-dependencies import-dependencies
   :export-dependencies export-dependencies
   :insert!             #(create-collections! % {:writer :import})
   :update!             #(update-collections! % {:writer :import})
   :delete!             delete-collections!})

(defmethod remote-sync/spec :model/Collection
  [_model]
  {:synced-items         collections.db/synced-collection-items
   :synced-filter-clause (partial collections.db/synced-collections-clause (vec (sort remote-synced-namespaces)))})

(defmethod search/spec :model/Collection
  [_model]
  {"collection"
   {:attrs        {:collection-id        :id
                   :collection-type      :type
                   :collection-location  :location
                   :root-collection-type {:fn root-collection-type}
                   :creator-id           false
                   :database-id          false
                   :archived             true
                   :created-at           true
                   ;; intentionally not tracked
                   :updated-at           false}
    :search-terms [:name]
    :render-terms {:archived-directly          true
                   ;; Why not make this a search term? I suspect it was just overlooked before.
                   :description                true
                   :collection_authority_level :authority_level
                   :collection_name            :name
                   ;; `:location` is read by the toucan2 effective-location hydration when collection
                   ;; results pass through `metabase.search.impl/add-collection-effective-location`.
                   ;; Keep the snake_case `location` key flowing alongside the indexed `collection_location`.
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
                                              [:= :bookmark.user_id :current_user/id]]]}})

(defmethod eid-translation/spec :model/Collection [_model]
  {:names [:collection]})
