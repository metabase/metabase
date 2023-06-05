(ns metabase.models.serialization
  "Defines several helper functions and multimethods for the serialization system.
  Serialization is an enterprise feature, but in the interest of keeping all the code for an entity in one place, these
  methods are defined here and implemented for all the exported models.

  Whether to export a new model:
  - Generally, the high-profile user facing things (databases, questions, dashboards, snippets, etc.) are exported.
  - Internal or automatic things (users, activity logs, permissions) are not.

  If the model is not exported, add it to the exclusion lists in the tests. Every model should be explicitly listed as
  exported or not, and a test enforces this so serialization isn't forgotten for new models."
  (:require
   [cheshire.core :as json]
   [clojure.core.match :refer [match]]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.db.util :as mdb.u]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.interface :as mi]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model])
  (:refer-clojure :exclude [descendants]))

(set! *warn-on-reflection* true)

(defmulti entity-id
  "Given the model name and an entity, returns its entity ID (which might be nil).

  This abstracts over the exact definition of the \"entity ID\" for a given entity.
  By default this is a column, `:entity_id`.

  Models that have a different portable ID should override this."
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defmethod entity-id :default [_ {:keys [entity_id]}]
  entity_id)

(defn raw-hash
  "Hashes a Clojure value into an 8-character hex string, which is used as the identity hash.
  Don't call this outside a test, use [[identity-hash]] instead."
  [target]
  (when (sequential? target)
    (assert (seq target) "target cannot be an empty sequence"))
  (format "%08x" (hash target)))

(defmulti hash-fields
  "Returns a seq of functions which will be transformed into a seq of values for hash calculation by calling each
   function on an entity map."
  {:arglists '([model-or-instance])}
  mi/dispatch-on-model)

(defn identity-hash
  "Returns an identity hash string from an entity map."
  [entity]
  {:pre [(some? entity)]}
  (-> (for [f (hash-fields entity)]
        (f entity))
      raw-hash))

(defn identity-hash?
  "Returns true if s is a valid identity hash string."
  [s]
  (boolean (re-matches #"^[0-9a-fA-F]{8}$" s)))

(defn hydrated-hash
  "Returns a function which accepts an entity and returns the identity hash of
   the value of the hydrated property under key k."
  [k]
  (fn [entity]
    (or
     (some-> entity (hydrate k) (get k) identity-hash)
     "<none>")))

(defmulti generate-path
  "Given the model name and raw entity from the database, returns a vector giving its *path*.
  `(generate-path \"ModelName\" entity)`

  The path is a vector of maps, root first and this entity itself last. Each map looks like:
  `{:model \"ModelName\" :id \"entity ID, identity hash, or custom ID\" :label \"optional human label\"}`"
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defn infer-self-path
  "Returns `{:model \"ModelName\" :id \"id-string\"}`"
  [model-name entity]
  (let [model (t2.model/resolve-model (symbol model-name))
        pk    (mdb.u/primary-key model)]
    {:model model-name
     :id    (or (entity-id model-name entity)
                (some-> (get entity pk) model identity-hash))}))

(defn maybe-labeled
  "Common helper for defining [[generate-path]] for an entity that is
  (1) top-level, ie. a one layer path;
  (2) labeled by a single field, slugified.

  For example, a Card's or Dashboard's `:name` field."
  [model-name entity slug-key]
  (let [self  (infer-self-path model-name entity)
        label (get entity slug-key)]
    [(if label
       (assoc self :label (u/slugify label {:unicode? true}))
       self)]))

(defmethod generate-path :default [model-name entity]
  ;; This default works for most models, but needs overriding for nested ones.
  (maybe-labeled model-name entity :name))

(defmulti extract-all
  "Entry point for extracting all entities of a particular model:
  `(extract-all \"ModelName\" {opts...})`
  Keyed on the model name.

  Returns a reducible stream of extracted maps (ie. vanilla Clojure maps with `:serdes/meta` keys).

  You probably don't want to implement this directly. The default implementation delegates to [[extract-query]] and
  [[extract-one]], which are usually more convenient to override."
  {:arglists '([model-name opts])}
  (fn [model-name _opts] model-name))

(defmulti extract-query
  "Performs the select query, possibly filtered, for all the entities of this model that should be serialized. Called
  from [[extract-all]]'s default implementation.

  `(extract-query \"ModelName\" opts)`

  Keyed on the model name, the first argument.

  Returns a reducible stream of modeled Toucan maps.

  Defaults to using `(toucan.t2/select model)` for the entire table.

  You may want to override this to eg. skip archived entities, or otherwise filter what gets serialized."
  {:arglists '([model-name opts])}
  (fn [model-name _opts] model-name))

(defmulti extract-one
  "Extracts a single entity retrieved from the database into a portable map with `:serdes/meta` attached.
  `(extract-one \"ModelName\" opts entity)`

  The default implementation uses [[generate-path]] to build the `:serdes/meta`. It also strips off the
  database's numeric primary key.

  That suffices for a few simple entities, but most entities will need to override this.
  They should follow the pattern of:
  - Convert to a vanilla Clojure map, not a [[models/IModel]] instance.
  - Drop the numeric database primary key
  - Replace any foreign keys with portable values (eg. entity IDs or `identity-hash`es, owning user's ID with their
    email, etc.)

  When overriding this, [[extract-one-basics]] is probably a useful starting point.

  Keyed by the model name of the entity, the first argument."
  {:arglists '([model-name opts instance])}
  (fn [model-name _opts _instance] model-name))

(defn- log-and-extract-one
  [model opts instance]
  (log/info (trs "Extracting {0} {1}" model (:id instance)))
  (extract-one model opts instance))

(defmethod extract-all :default [model opts]
  (eduction (map (partial log-and-extract-one model opts))
            (extract-query model opts)))

(defn extract-query-collections
  "Helper for the common (but not default) [[extract-query]] case of fetching everything that isn't in a personal
  collection."
  [model {:keys [collection-set]}]
  (if collection-set
    ;; If collection-set is defined, select everything in those collections, or with nil :collection_id.
    (let [in-colls  (db/select-reducible model :collection_id [:in collection-set])]
      (if (contains? collection-set nil)
        (eduction cat [in-colls (db/select-reducible model :collection_id nil)])
        in-colls))
    ;; If collection-set is nil, just select everything.
    (db/select-reducible model)))

(defmethod extract-query :default [model-name _]
  (db/select-reducible (symbol model-name)))

(defn extract-one-basics
  "A helper for writing [[extract-one]] implementations. It takes care of the basics:
  - Convert to a vanilla Clojure map.
  - Add `:serdes/meta` by calling [[generate-path]].
  - Drop the primary key.
  - Drop :updated_at; it's noisy in git and not really used anywhere.

  Returns the Clojure map."
  [model-name entity]
  (let [model (t2.model/resolve-model (symbol model-name))
        pk    (mdb.u/primary-key model)]
    (-> (into {} entity)
        (assoc :serdes/meta (generate-path model-name entity))
        (dissoc pk :updated_at))))

(defmethod extract-one :default [model-name _opts entity]
  (extract-one-basics model-name entity))

(defmulti descendants
  "Returns set of `[model-name database-id]` pairs for all entities contained or used by this entity. e.g. the Dashboard
   implementation should return pairs for all DashboardCard entities it contains, etc.

   Dispatched on model-name."
  {:arglists '([model-name db-id])}
  (fn [model-name _] model-name))

(defmethod descendants :default [_ _]
  nil)

(defn- ingested-model
  "The dispatch function for several of the load multimethods: dispatching on the model of the incoming entity."
  [ingested]
  (-> ingested :serdes/meta last :model))

(defn path
  "Given an exported or imported entity with a `:serdes/meta` key on it, return the abstract path (not a filesystem
  path)."
  [entity]
  (:serdes/meta entity))

(defmulti load-find-local
  "Given a path, tries to look up any corresponding local entity.

  Returns nil, or the local Toucan entity that corresponds to the given path.
  Keyed on the model name at the leaf of the path.

  By default, this tries to look up the entity by its `:entity_id` column, or identity hash, depending on the shape of
  the incoming key. For the identity hash, this scans the entire table and builds a cache of
  [[identity-hash]] to primary keys, since the identity hash cannot be queried directly.
  This cache is cleared at the beginning and end of the deserialization process."
  {:arglists '([path])}
  (fn [path]
    (-> path last :model)))

(declare lookup-by-id)

(defmethod load-find-local :default [path]
  (let [{id :id model-name :model} (last path)
        model                      (t2.model/resolve-model (symbol model-name))]
    (when model
      (lookup-by-id model id))))

(defmulti dependencies
  "Given an entity map as ingested (not a Toucan entity) returns a (possibly empty) list of its dependencies, where each
  dependency is represented by its abstract path (its `:serdes/meta` value).

  Keyed on the model name for this entity.
  Default implementation returns an empty vector, so only models that have dependencies need to implement this."
  {:arglists '([ingested])}
  ingested-model)

(defmethod dependencies :default [_]
  [])

(defmulti load-xform
  "Given the incoming vanilla map as ingested, transform it so it's suitable for sending to the database (in eg.
  [[db/insert!]]).
  For example, this should convert any foreign keys back from a portable entity ID or identity hash into a numeric
  database ID. This is the mirror of [[extract-one]], in spirit. (They're not strictly inverses - [[extract-one]] drops
  the primary key but this need not put one back, for example.)

  By default, this just calls [[load-xform-basics]].
  If you override this, call [[load-xform-basics]] as well."
  {:arglists '([ingested])}
  ingested-model)

(defn load-xform-basics
  "Performs the usual steps for an incoming entity:
  - Drop :serdes/meta

  You should call this as a first step from any implementation of [[load-xform]].

  This is a mirror (but not precise inverse) of [[extract-one-basics]]."
  [ingested]
  (dissoc ingested :serdes/meta))

(defmethod load-xform :default [ingested]
  (load-xform-basics ingested))

(defmulti load-update!
  "Called by the default [[load-one!]] if there is a corresponding entity already in the appdb.
  `(load-update! \"ModelName\" ingested-and-xformed local-Toucan-entity)`

  Defaults to a straightforward [[t2/update!]], and you may not need to update it.

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the updated entity."
  {:arglists '([model-name ingested local])}
  (fn [model _ _] model))

(defmethod load-update! :default [model-name ingested local]
  (let [model    (t2.model/resolve-model (symbol model-name))
        pk       (mdb.u/primary-key model)
        id       (get local pk)]
    (log/tracef "Upserting %s %d: old %s new %s" model-name id (pr-str local) (pr-str ingested))
    (t2/update! model id ingested)
    (t2/select-one model pk id)))

(defmulti load-insert!
  "Called by the default [[load-one!]] if there is no corresponding entity already in the appdb.
  `(load-insert! \"ModelName\" ingested-and-xformed)`

  Defaults to a straightforward [[(comp first t2/insert-returning-instances!)]] (returning the created object),
  and you probably don't need to implement this.

  Note that any [[t2/insert!]] behavior we don't want to run (like generating an `:entity_id`!) should be skipped based
  on the [[mi/*deserializing?*]] dynamic var.

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the newly inserted entity."
  {:arglists '([model ingested])}
  (fn [model _] model))

(defmethod load-insert! :default [model-name ingested]
  (log/tracef "Inserting %s: %s" model-name (pr-str ingested))
  (first (t2/insert-returning-instances! (t2.model/resolve-model (symbol model-name)) ingested)))

(defmulti load-one!
  "Black box for integrating a deserialized entity into this appdb.
  `(load-one! ingested maybe-local)`

  `ingested` is the vanilla map from ingestion, with the `:serdes/meta` key on it.
  `maybe-local` is either `nil`, or the corresponding Toucan entity from the appdb.

  Defaults to calling [[load-xform]] to massage the incoming map, then either [[load-update!]] if `maybe-local`
  exists, or [[load-insert!]] if it's `nil`.

  Prefer overriding [[load-xform]], and if necessary [[load-update!]] and [[load-insert!]], rather than this.

  Keyed on the model name.

  Returns the primary key of the updated or inserted entity."
  (fn [ingested _]
    (ingested-model ingested)))

(defmethod load-one! :default [ingested maybe-local]
  (let [model    (ingested-model ingested)
        adjusted (load-xform ingested)]
    (binding [mi/*deserializing?* true]
      (if (nil? maybe-local)
        (load-insert! model adjusted)
        (load-update! model adjusted maybe-local)))))


(defn entity-id?
  "Checks if the given string is a 21-character NanoID. Useful for telling entity IDs apart from identity hashes."
  [id-str]
  (boolean (and id-str
                (string? id-str)
                (re-matches #"^[A-Za-z0-9_-]{21}$" id-str))))

(defn- find-by-identity-hash
  "Given a model and a target identity hash, this scans the appdb for any instance of the model corresponding to the
  hash. Does a complete scan, so this should be called sparingly!"
  ;; TODO This should be able to use a cache of identity-hash values from the start of the deserialization process.
  ;; Note that it needs to include either updates (or worst-case, invalidation) at [[load-one!]] time.
  [model id-hash]
  (->> (db/select-reducible model)
       (into [] (comp (filter #(= id-hash (identity-hash %)))
                      (take 1)))
       first))

(defn lookup-by-id
  "Given an ID string, this endeavours to find the matching entity, whether it's an entity ID or identity hash.
  This is useful when writing [[load-xform]] to turn a foreign key from a portable form to an appdb ID.
  Returns a Toucan entity or nil."
  [model id-str]
  (if (entity-id? id-str)
    (t2/select-one model :entity_id id-str)
    (find-by-identity-hash model id-str)))

(def ^:private max-label-length 100)

(defn- truncate-label [s]
  (if (> (count s) max-label-length)
    (subs s 0 max-label-length)
    s))

(defn- lower-plural [s]
  (-> s u/lower-case-en (str "s")))

(defn storage-leaf-file-name
  "Captures the common pattern for leaf file names as `entityID_label`."
  ([id]       (str id))
  ([id label] (if (nil? label)
                (storage-leaf-file-name id)
                (str id "_" (truncate-label label)))))

(defn storage-default-collection-path
  "Implements the most common structure for [[storage-path]] - `collections/c1/c2/c3/models/entityid_slug.ext`"
  [entity {:keys [collections]}]
  (let [{:keys [model id label]} (-> entity path last)]
    (concat ["collections"]
            (get collections (:collection_id entity)) ;; This can be nil, but that's fine - that's the root collection.
            [(lower-plural model) (storage-leaf-file-name id label)])))

(defmulti storage-path
  "Returns a seq of storage path components for a given entity. Dispatches on model name."
  {:arglists '([entity ctx])}
  (fn [entity _] (ingested-model entity)))

(defmethod storage-path :default [entity ctx]
  (storage-default-collection-path entity ctx))

(defn storage-base-context
  "Creates the basic context for storage. This is a map with a single entry: `:collections` is a map from collection ID
  to the path of collections."
  []
  (let [colls      (t2/select ['Collection :id :entity_id :location :slug])
        coll-names (into {} (for [{:keys [id entity_id slug]} colls]
                              [(str id) (storage-leaf-file-name entity_id slug)]))
        coll->path (into {} (for [{:keys [entity_id id location]} colls
                                  :let [parents (rest (str/split location #"/"))]]
                              [entity_id (map coll-names (concat parents [(str id)]))]))]
    {:collections coll->path}))

(defn log-path-str
  "Returns a string for logging from a serdes path sequence (i.e. in :serdes/meta)"
  [elements]
  (->> elements
       (map #(str (:model %) " " (:id %)))
       (str/join " > ")))


;; utils

;; -------------------------------------------- General Foreign Keys -------------------------------------------------
(defn ^:dynamic ^::cache *export-fk*
  "Given a numeric foreign key and its model (symbol, name or IModel), looks up the entity by ID and gets its entity ID
  or identity hash.
  Unusual parameter order means this can be used as `(update x :some_id export-fk 'SomeModel)`.

  NOTE: This works for both top-level and nested entities. Top-level entities like `Card` are returned as just a
  portable ID string.. Nested entities are returned as a vector of such ID strings."
  [id model]
  (when id
    (let [model-name (name model)
          model      (t2.model/resolve-model (symbol model-name))
          entity     (t2/select-one model (mdb.u/primary-key model) id)
          path       (mapv :id (generate-path model-name entity))]
      (if (= (count path) 1)
        (first path)
        path))))

(defn ^:dynamic ^::cache *import-fk*
  "Given an identifier, and the model it represents (symbol, name or IModel), looks up the corresponding
  entity and gets its primary key.

  The identifier can be a single entity ID string, a single identity-hash string, or a vector of entity ID and hash
  strings. If the ID is compound, then the last ID is the one that corresponds to the model. This allows for the
  compound IDs needed for nested entities like `DashboardCard`s to get their [[serdes/serdes-dependencies]].

  Throws if the corresponding entity cannot be found.

  Unusual parameter order means this can be used as `(update x :some_id import-fk 'SomeModel)`."
  [eid model]
  (when eid
    (let [model-name (name model)
          model      (t2.model/resolve-model (symbol model-name))
          eid        (if (vector? eid)
                       (last eid)
                       eid)
          entity     (lookup-by-id model eid)]
      (if entity
        (get entity (mdb.u/primary-key model))
        (throw (ex-info "Could not find foreign key target - bad serdes-dependencies or other serialization error"
                        {:entity_id eid :model (name model)}))))))

(defn ^:dynamic ^::cache *export-fk-keyed*
  "Given a numeric ID, look up a different identifying field for that entity, and return it as a portable ID.
  Eg. `Database.name`.
  [[import-fk-keyed]] is the inverse.
  Unusual parameter order lets this be called as, for example, `(update x :creator_id export-fk-keyed 'Database :name)`.

  Note: This assumes the primary key is called `:id`."
  [id model field]
  (t2/select-one-fn field model :id id))

(defn ^:dynamic ^::cache *import-fk-keyed*
  "Given a single, portable, identifying field and the model it refers to, this resolves the entity and returns its
  numeric `:id`.
  Eg. `Database.name`.

  Unusual parameter order lets this be called as, for example,
  `(update x :creator_id import-fk-keyed 'Database :name)`."
  [portable model field]
  (t2/select-one-pk model field portable))

;; -------------------------------------------------- Users ----------------------------------------------------------
(defn ^:dynamic ^::cache *export-user*
  "Exports a user as the email address.
  This just calls [[export-fk-keyed]], but the counterpart [[import-user]] is more involved. This is a unique function
  so they form a pair."
  [id]
  (when id (*export-fk-keyed* id 'User :email)))

(defn ^:dynamic ^::cache *import-user*
  "Imports a user by their email address.
  If a user with that email address exists, returns its primary key.
  If no such user exists, creates a dummy one with the default settings, blank name, and randomized password.
  Does not send any invite emails."
  [email]
  (when email
    (or (*import-fk-keyed* email 'User :email)
        ;; Need to break a circular dependency here.
        (:id ((resolve 'metabase.models.user/serdes-synthesize-user!) {:email email})))))

;; -------------------------------------------------- Tables ---------------------------------------------------------
(defn ^:dynamic ^::cache *export-table-fk*
  "Given a numeric `table_id`, return a portable table reference.
  If the `table_id` is `nil`, return `nil`. This is legal for a native question.
  That has the form `[db-name schema table-name]`, where the `schema` might be nil.
  [[import-table-fk]] is the inverse."
  [table-id]
  (when table-id
    (let [{:keys [db_id name schema]} (t2/select-one 'Table :id table-id)
          db-name                     (t2/select-one-fn :name 'Database :id db_id)]
      [db-name schema name])))

(defn ^:dynamic ^::cache *import-table-fk*
  "Given a `table_id` as exported by [[export-table-fk]], resolve it back into a numeric `table_id`.
  The input might be nil, in which case so is the output. This is legal for a native question."
  [[db-name schema table-name :as table-id]]
  (when table-id
    (t2/select-one-fn :id 'Table :name table-name :schema schema :db_id (t2/select-one-fn :id 'Database :name db-name))))

(defn table->path
  "Given a `table_id` as exported by [[export-table-fk]], turn it into a `[{:model ...}]` path for the Table.
  This is useful for writing [[metabase.models.serialization.base/serdes-dependencies]] implementations."
  [[db-name schema table-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}]))

(defn storage-table-path-prefix
  "The [[serdes/storage-path]] for Table is a bit tricky, and shared with Fields and FieldValues, so it's
  factored out here.
  Takes the :serdes/meta value for a `Table`!
  The return value includes the directory for the Table, but not the file for the Table itself.

  With a schema: `[\"databases\" \"db_name\" \"schemas\" \"public\" \"tables\" \"customers\"]`
  No schema:     `[\"databases\" \"db_name\" \"tables\" \"customers\"]`"
  [path]
  (let [db-name    (-> path first :id)
        schema     (when (= (count path) 3)
                     (-> path second :id))
        table-name (-> path last :id)]
    (concat ["databases" db-name]
            (when schema ["schemas" schema])
            ["tables" table-name])))

;; -------------------------------------------------- Fields ---------------------------------------------------------
(defn ^:dynamic ^::cache *export-field-fk*
  "Given a numeric `field_id`, return a portable field reference.
  That has the form `[db-name schema table-name field-name]`, where the `schema` might be nil.
  [[import-field-fk]] is the inverse."
  [field-id]
  (when field-id
    (let [{:keys [name table_id]}     (t2/select-one 'Field :id field-id)
          [db-name schema field-name] (*export-table-fk* table_id)]
      [db-name schema field-name name])))

(defn ^:dynamic ^::cache *import-field-fk*
  "Given a `field_id` as exported by [[export-field-fk]], resolve it back into a numeric `field_id`."
  [[db-name schema table-name field-name :as field-id]]
  (when field-id
    (let [table_id (*import-table-fk* [db-name schema table-name])]
      (t2/select-one-pk 'Field :table_id table_id :name field-name))))

(defn field->path
  "Given a `field_id` as exported by [[export-field-fk]], turn it into a `[{:model ...}]` path for the Field.
  This is useful for writing [[metabase.models.serialization.base/serdes-dependencies]] implementations."
  [[db-name schema table-name field-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}
                  {:model "Field" :id field-name}]))

;; ---------------------------------------------- MBQL Fields --------------------------------------------------------
(defn- mbql-entity-reference?
  "Is given form an MBQL entity reference?"
  [form]
  (mbql.normalize/is-clause? #{:field :field-id :fk-> :dimension :metric :segment} form))

(defn- mbql-id->fully-qualified-name
  [mbql]
  (-> mbql
      mbql.normalize/normalize-tokens
      (mbql.u/replace
        ;; `integer?` guard is here to make the operation idempotent
       [:field (id :guard integer?) opts]
       [:field (*export-field-fk* id) (mbql-id->fully-qualified-name opts)]

        ;; `integer?` guard is here to make the operation idempotent
       [:field (id :guard integer?)]
       [:field (*export-field-fk* id)]

        ;; field-id is still used within parameter mapping dimensions
        ;; example relevant clause - [:dimension [:fk-> [:field-id 1] [:field-id 2]]]
       [:field-id (id :guard integer?)]
       [:field-id (*export-field-fk* id)]

       {:source-table (id :guard integer?)}
       (assoc &match :source-table (*export-table-fk* id))

        ;; source-field is also used within parameter mapping dimensions
        ;; example relevant clause - [:field 2 {:source-field 1}]
       {:source-field (id :guard integer?)}
       (assoc &match :source-field (*export-field-fk* id))

       [:dimension (dim :guard vector?)]
       [:dimension (mbql-id->fully-qualified-name dim)]

       [:metric (id :guard integer?)]
       [:metric (*export-fk* id 'Metric)]

       [:segment (id :guard integer?)]
       [:segment (*export-fk* id 'Segment)])))

(defn- export-source-table
  [source-table]
  (if (and (string? source-table)
           (str/starts-with? source-table "card__"))
    (*export-fk* (-> source-table
                   (str/split #"__")
                   second
                   Integer/parseInt)
               'Card)
    (*export-table-fk* source-table)))

(defn- ids->fully-qualified-names
  [entity]
  (mbql.u/replace entity
                  mbql-entity-reference?
                  (mbql-id->fully-qualified-name &match)

                  sequential?
                  (mapv ids->fully-qualified-names &match)

                  map?
                  (as-> &match entity
                    (m/update-existing entity :database (fn [db-id]
                                                          (if (= db-id mbql.s/saved-questions-virtual-database-id)
                                                            "database/__virtual"
                                                            (t2/select-one-fn :name 'Database :id db-id))))
                    (m/update-existing entity :card_id #(*export-fk* % 'Card)) ; attibutes that refer to db fields use _
                    (m/update-existing entity :card-id #(*export-fk* % 'Card)) ; template-tags use dash
                    (m/update-existing entity :source-table export-source-table)
                    (m/update-existing entity :source_table export-source-table)
                    (m/update-existing entity :breakout    (fn [breakout]
                                                             (mapv mbql-id->fully-qualified-name breakout)))
                    (m/update-existing entity :aggregation (fn [aggregation]
                                                             (mapv mbql-id->fully-qualified-name aggregation)))
                    (m/update-existing entity :filter      ids->fully-qualified-names)
                    (m/update-existing entity ::mb.viz/param-mapping-source *export-field-fk*)
                    (m/update-existing entity :segment    *export-fk* 'Segment)
                    (m/update-existing entity :snippet-id *export-fk* 'NativeQuerySnippet)
                    (merge entity
                           (m/map-vals ids->fully-qualified-names
                                       (dissoc entity
                                               :database :card_id :card-id :source-table :breakout :aggregation :filter :segment
                                               ::mb.viz/param-mapping-source :snippet-id))))))

(defn export-mbql
  "Given an MBQL expression, convert it to an EDN structure and turn the non-portable Database, Table and Field IDs
  inside it into portable references."
  [encoded]
  (ids->fully-qualified-names encoded))

(defn- portable-id?
  "True if the provided string is either an Entity ID or identity-hash string."
  [s]
  (and (string? s)
       (or (entity-id? s)
           (identity-hash? s))))

(defn- mbql-fully-qualified-names->ids*
  [entity]
  (mbql.u/replace entity
    ;; handle legacy `:field-id` forms encoded prior to 0.39.0
    ;; and also *current* expresion forms used in parameter mapping dimensions
    ;; example relevant clause - [:dimension [:fk-> [:field-id 1] [:field-id 2]]]
                  [(:or :field-id "field-id") fully-qualified-name]
                  (mbql-fully-qualified-names->ids* [:field fully-qualified-name])

                  [(:or :field "field") (fully-qualified-name :guard vector?) opts]
                  [:field (*import-field-fk* fully-qualified-name) (mbql-fully-qualified-names->ids* opts)]
                  [(:or :field "field") (fully-qualified-name :guard vector?)]
                  [:field (*import-field-fk* fully-qualified-name)]


    ;; source-field is also used within parameter mapping dimensions
    ;; example relevant clause - [:field 2 {:source-field 1}]
                  {:source-field (fully-qualified-name :guard vector?)}
                  (assoc &match :source-field (*import-field-fk* fully-qualified-name))

                  {:database (fully-qualified-name :guard string?)}
                  (-> &match
                      (assoc :database (if (= fully-qualified-name "database/__virtual")
                                         mbql.s/saved-questions-virtual-database-id
                                         (t2/select-one-pk 'Database :name fully-qualified-name)))
                      mbql-fully-qualified-names->ids*) ; Process other keys

                  {:card-id (entity-id :guard portable-id?)}
                  (-> &match
                      (assoc :card-id (*import-fk* entity-id 'Card))
                      mbql-fully-qualified-names->ids*) ; Process other keys

                  [(:or :metric "metric") (fully-qualified-name :guard portable-id?)]
                  [:metric (*import-fk* fully-qualified-name 'Metric)]

                  [(:or :segment "segment") (fully-qualified-name :guard portable-id?)]
                  [:segment (*import-fk* fully-qualified-name 'Segment)]

                  (_ :guard (every-pred map? #(vector? (:source-table %))))
                  (-> &match
                      (assoc :source-table (*import-table-fk* (:source-table &match)))
                      mbql-fully-qualified-names->ids*)

                  (_ :guard (every-pred map? #(vector? (:source_table %))))
                  (-> &match
                      (assoc :source_table (*import-table-fk* (:source_table &match)))
                      mbql-fully-qualified-names->ids*)

                  (_ :guard (every-pred map? (comp portable-id? :source-table)))
                  (-> &match
                      (assoc :source-table (str "card__" (*import-fk* (:source-table &match) 'Card)))
                      mbql-fully-qualified-names->ids*)

                  (_ :guard (every-pred map? (comp portable-id? :source_table)))
                  (-> &match
                      (assoc :source_table (str "card__" (*import-fk* (:source_table &match) 'Card)))
                      mbql-fully-qualified-names->ids*) ;; process other keys

                  (_ :guard (every-pred map? (comp portable-id? :snippet-id)))
                  (-> &match
                      (assoc :snippet-id (*import-fk* (:snippet-id &match) 'NativeQuerySnippet))
                      mbql-fully-qualified-names->ids*)))

(defn- mbql-fully-qualified-names->ids
  [entity]
  (mbql-fully-qualified-names->ids* entity))

(defn import-mbql
  "Given an MBQL expression as an EDN structure with portable IDs embedded, convert the IDs back to raw numeric IDs."
  [exported]
  (mbql-fully-qualified-names->ids exported))


(declare ^:private mbql-deps-map)

(defn- mbql-deps-vector [entity]
  (match entity
    [:field     (field :guard vector?)]      #{(field->path field)}
    ["field"    (field :guard vector?)]      #{(field->path field)}
    [:field-id  (field :guard vector?)]      #{(field->path field)}
    ["field-id" (field :guard vector?)]      #{(field->path field)}
    [:field     (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
    ["field"    (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
    [:field-id  (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
    ["field-id" (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
    [:metric    (field :guard portable-id?)] #{[{:model "Metric" :id field}]}
    ["metric"   (field :guard portable-id?)] #{[{:model "Metric" :id field}]}
    [:segment   (field :guard portable-id?)] #{[{:model "Segment" :id field}]}
    ["segment"  (field :guard portable-id?)] #{[{:model "Segment" :id field}]}
    :else (reduce #(cond
                     (map? %2)    (into %1 (mbql-deps-map %2))
                     (vector? %2) (into %1 (mbql-deps-vector %2))
                     :else %1)
                  #{}
                  entity)))

(defn- mbql-deps-map [entity]
  (->> (for [[k v] entity]
         (cond
           (and (= k :database)
                (string? v)
                (not= v "database/__virtual"))        #{[{:model "Database" :id v}]}
           (and (= k :source-table) (vector? v))      #{(table->path v)}
           (and (= k :source-table) (portable-id? v)) #{[{:model "Card" :id v}]}
           (and (= k :source-field) (vector? v))      #{(field->path v)}
           (and (= k :snippet-id)   (portable-id? v)) #{[{:model "NativeQuerySnippet" :id v}]}
           (and (= k :card_id)      (string? v))      #{[{:model "Card" :id v}]}
           (and (= k :card-id)      (string? v))      #{[{:model "Card" :id v}]}
           (map? v)                                   (mbql-deps-map v)
           (vector? v)                                (mbql-deps-vector v)))
       (reduce set/union #{})))

(defn mbql-deps
  "Given an MBQL expression as exported, with qualified names like `[\"some-db\" \"schema\" \"table_name\"]` instead of
  raw IDs, return the corresponding set of serdes-dependencies. The query can't be imported until all the referenced
  databases, tables and fields are loaded."
  [entity]
  (cond
    (map? entity)     (mbql-deps-map entity)
    (seqable? entity) (mbql-deps-vector entity)
    :else             (mbql-deps-vector [entity])))

(defn export-parameter-mappings
  "Given the :parameter_mappings field of a `Card` or `DashboardCard`, as a vector of maps, converts
  it to a portable form with the field IDs replaced with `[db schema table field]` references."
  [mappings]
  (map ids->fully-qualified-names mappings))

(defn import-parameter-mappings
  "Given the :parameter_mappings field as exported by serialization convert its field references
  (`[db schema table field]`) back into raw IDs."
  [mappings]
  (->> mappings
       (map mbql-fully-qualified-names->ids)
       (map #(m/update-existing % :card_id *import-fk* 'Card))))

(defn export-parameters
  "Given the :parameter field of a `Card` or `Dashboard`, as a vector of maps, converts
  it to a portable form with the CardIds/FieldIds replaced with `[db schema table field]` references."
  [parameters]
  (map ids->fully-qualified-names parameters))

(defn import-parameters
  "Given the :parameter field as exported by serialization convert its field references
  (`[db schema table field]`) back into raw IDs."
  [parameters]
  (for [param parameters]
    (-> param
        mbql-fully-qualified-names->ids
        (m/update-existing-in [:values_source_config :card_id] *import-fk* 'Card))))

(defn parameters-deps
  "Given the :parameters (possibly nil) for an entity, return any embedded serdes-deps as a set.
  Always returns an empty set even if the input is nil."
  [parameters]
  (reduce set/union #{}
          (for [parameter parameters
                :when (= "card" (:values_source_type parameter))
                :let  [config (:values_source_config parameter)]]
            (set/union #{[{:model "Card" :id (:card_id config)}]}
                       (mbql-deps-vector (:value_field config))))))

(def link-card-model->toucan-model
  "A map from model on linkcards to its corresponding toucan model.

  Link cards are dashcards that link to internal entities like Database/Dashboard/... or an url.

  It's here instead of [metabase.models.dashboard_card] to avoid cyclic deps."
  {"card"       :model/Card
   "dataset"    :model/Card
   "collection" :model/Collection
   "database"   :model/Database
   "dashboard"  :model/Dashboard
   "table"      :model/Table})

(defn- export-viz-link-card
  [settings]
  (m/update-existing-in
   settings
   [:link :entity]
   (fn [{:keys [id model] :as entity}]
     (merge entity
            {:id (case model
                   "table"    (*export-table-fk* id)
                   "database" (*export-fk-keyed* id 'Database :name)
                   (*export-fk* id (link-card-model->toucan-model model)))}))))

(defn- export-visualizations [entity]
  (mbql.u/replace
   entity
   ["field-id" (id :guard number?)]
   ["field-id" (*export-field-fk* id)]
   [:field-id (id :guard number?)]
   [:field-id (*export-field-fk* id)]

   ["field-id" (id :guard number?) tail]
   ["field-id" (*export-field-fk* id) (export-visualizations tail)]
   [:field-id (id :guard number?) tail]
   [:field-id (*export-field-fk* id) (export-visualizations tail)]

   ["field" (id :guard number?)]
   ["field" (*export-field-fk* id)]
   [:field (id :guard number?)]
   [:field (*export-field-fk* id)]

   ["field" (id :guard number?) tail]
   ["field" (*export-field-fk* id) (export-visualizations tail)]
   [:field (id :guard number?) tail]
   [:field (*export-field-fk* id) (export-visualizations tail)]

   (_ :guard map?)
   (m/map-vals export-visualizations &match)

   (_ :guard vector?)
   (mapv export-visualizations &match)))

(defn- export-column-settings
  "Column settings use a JSON-encoded string as a map key, and it contains field numbers.
  This function parses those keys, converts the IDs to portable values, and serializes them back to JSON."
  [settings]
  (when settings
    (update-keys settings #(-> % json/parse-string export-visualizations json/generate-string))))

(defn export-visualization-settings
  "Given the `:visualization_settings` map, convert all its field-ids to portable `[db schema table field]` form."
  [settings]
  (when settings
    (-> settings
        export-visualizations
        export-viz-link-card
        (update :column_settings export-column-settings))))

(defn- import-viz-link-card
  [settings]
  (m/update-existing-in
   settings
   [:link :entity]
   (fn [{:keys [id model] :as entity}]
     (merge entity
            {:id (case model
                   "table"    (*import-table-fk* id)
                   "database" (*import-fk-keyed* id 'Database :name)
                   (*import-fk* id (link-card-model->toucan-model model)))}))))

(defn- import-visualizations [entity]
  (mbql.u/replace
   entity
   [(:or :field-id "field-id") (fully-qualified-name :guard vector?) tail]
   [:field-id (*import-field-fk* fully-qualified-name) (import-visualizations tail)]
   [(:or :field-id "field-id") (fully-qualified-name :guard vector?)]
   [:field-id (*import-field-fk* fully-qualified-name)]

   [(:or :field "field") (fully-qualified-name :guard vector?) tail]
   [:field (*import-field-fk* fully-qualified-name) (import-visualizations tail)]
   [(:or :field "field") (fully-qualified-name :guard vector?)]
   [:field (*import-field-fk* fully-qualified-name)]

   (_ :guard map?)
   (m/map-vals import-visualizations &match)

   (_ :guard vector?)
   (mapv import-visualizations &match)))

(defn- import-column-settings [settings]
  (when settings
    (update-keys settings #(-> % name json/parse-string import-visualizations json/generate-string))))

(defn import-visualization-settings
  "Given an EDN value as exported by [[export-visualization-settings]], convert its portable `[db schema table field]`
  references into Field IDs."
  [settings]
  (when settings
    (-> settings
        import-visualizations
        import-viz-link-card
        (update :column_settings import-column-settings))))

(defn- viz-link-card-deps
  [settings]
  (when-let [{:keys [model id]} (get-in settings [:link :entity])]
    #{(case model
        "table" (table->path id)
        [{:model (name (link-card-model->toucan-model model))
          :id    id}])}))

(defn visualization-settings-deps
  "Given the :visualization_settings (possibly nil) for an entity, return any embedded serdes-deps as a set.
  Always returns an empty set even if the input is nil."
  [viz]
  (let [vis-column-settings (some->> viz
                                     :column_settings
                                     keys
                                     (map (comp mbql-deps json/parse-string name)))
        link-card-deps      (viz-link-card-deps viz)]
    (->> (concat vis-column-settings [(mbql-deps viz) link-card-deps])
         (filter some?)
         (reduce set/union))))

(defmacro with-cache
  "Runs body with all functions marked with ::cache re-bound to memoized versions for performance."
  [& body]
  (let [ns* 'metabase.models.serialization]
    `(binding ~(reduce into []
                       (for [[var-sym var] (ns-interns ns*)
                             :when (::cache (meta var))
                             :let  [fq-sym (symbol (name ns*) (name var-sym))]]
                         [fq-sym `(memoize ~fq-sym)]))
       ~@body)))
