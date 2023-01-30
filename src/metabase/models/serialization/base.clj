(ns metabase.models.serialization.base
  "Defines several helper functions and multimethods for the serialization system.
  Serialization is an enterprise feature, but in the interest of keeping all the code for an entity in one place, these
  methods are defined here and implemented for all the exported models.

  Whether to export a new model:
  - Generally, the high-profile user facing things (databases, questions, dashboards, snippets, etc.) are exported.
  - Internal or automatic things (users, activity logs, permissions) are not.

  If the model is not exported, add it to the exclusion lists in the tests. Every model should be explicitly listed as
  exported or not, and a test enforces this so serialization isn't forgotten for new models."
  (:require
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [metabase.models.interface :as mi]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.util :as u]
   [toucan.db :as db]
   [toucan.models :as models]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              :serdes/meta                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; The Clojure maps from extraction and ingestion always include a special key `:serdes/meta` giving some information
;;; about the serialized entity. The value is always a vector of maps that give a "path" to the entity. This is not a
;;; filesystem path; rather it defines the nesting of some entities inside others.
;;;
;;; Most paths are a single layer:
;;; `[{:model "ModelName" :id "entity ID or identity hash string" :label "Human-readable name"}]`
;;; `:model` and `:id` are required; `:label` is optional.
;;;
;;; But for some entities, it can be deeper. For example Fields belong to Tables, which are in Schemas (which don't
;;; really exist in appdb, but are reflected here for namespacing of table names), which are in Databases:
;;; `[{:model "Database" :id "my_db"}
;;;   {:model "Schema"   :id "PUBLIC"}
;;;   {:model "Table"    :id "Users"}
;;;   {:model "Field"    :id "email"}]`
;;;
;;; Many of the multimethods are keyed on the `:model` field of the leaf entry (the last).

(defmulti serdes-entity-id
  "Given the model name and an entity, returns its entity ID (which might be nil).

  This abstracts over the exact definition of the \"entity ID\" for a given entity.
  By default this is a column, `:entity_id`.

  Models that have a different portable ID should override this."
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defmethod serdes-entity-id :default [_ {:keys [entity_id]}]
  entity_id)

(defmulti serdes-generate-path
  "Given the model name and raw entity from the database, returns a vector giving its *path*.
  `(serdes-generate-path \"ModelName\" entity)`

  The path is a vector of maps, root first and this entity itself last. Each map looks like:
  `{:model \"ModelName\" :id \"entity ID, identity hash, or custom ID\" :label \"optional human label\"}`

  Some entities stand alone, while some are naturally nested inside others. For example, fields belong in tables, which
  belong in databases. Further, since these use eg. column names as entity IDs, they can collide if all the fields get
  poured into one namespace (like a directory of YAML files).

  Finally, it's often useful to delete the databases from an export, since the receiving end has its own different, but
  compatible, database definitions. (For example, staging and prod instances of Metabase.) It's convenient for human
  understanding and editing to group fields under tables under databases.

  Therefore we provide an abstract path on the entities, which will generally be stored in a directory tree.
  (This is not strictly required - for a different medium like protobufs the path might be encoded some other way.)

  The path is reconstructed by ingestion and used as the key to read entities with `ingest-one`, and to match
  against existing entities.

  The default implementation is a single level, using the model name provided and the ID from either
  [[serdes-entity-id]] or [[serdes.hash/identity-hash]], and any `:name` field as the `:label`.
  This default implementation is factored out as [[maybe-labeled]] for reuse.

  Implementation notes:
  - `:serdes/meta` might be defined - if so it's coming from ingestion and might have truncated values in it, and should
    be reconstructed from the rest of the data.
  - The primary key might still be attached, during extraction.
  - `:label` is optional
  - The logic to guess the leaf part of the path is in [[infer-self-path]], for use in overriding."
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defn infer-self-path
  "Implements the default logic from [[serdes-generate-path]] that guesses the `:id` of this entity. Factored out
  so it can be called by implementors of [[serdes-generate-path]].

  The guesses are:
  - [[serdes-entity-id]]
  - [[serdes.hash/identity-hash]] after looking up the Toucan entity by primary key

  Returns `{:model \"ModelName\" :id \"id-string\"}`; throws if the inference fails, since it indicates a programmer
  error and not a runtime one."
  [model-name entity]
  (let [model (db/resolve-model (symbol model-name))
        pk    (models/primary-key model)]
    {:model model-name
     :id    (or (serdes-entity-id model-name entity)
                (some-> (get entity pk) model serdes.hash/identity-hash)
                (throw (ex-info "Could not infer-self-path on this entity - maybe implement serdes-entity-id ?"
                                {:model model-name :entity entity})))}))

(defn maybe-labeled
  "Common helper for defining [[serdes-generate-path]] for an entity that is
  (1) top-level, ie. a one layer path;
  (2) labeled by a single field, slugified.

  For example, a Card's or Dashboard's `:name` field."
  [model-name entity slug-key]
  (let [self  (infer-self-path model-name entity)
        label (get entity slug-key)]
    [(if label
       (assoc self :label (u/slugify label {:unicode? true}))
       self)]))

(defmethod serdes-generate-path :default [model-name entity]
  ;; This default works for most models, but needs overriding for nested ones.
  (maybe-labeled model-name entity :name))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Serialization Process                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; Serialization happens in two stages: extraction and storage. These are independent and deliberately decoupled.
;;; The result of extraction is a reducible stream of Clojure maps with `:serdes/meta` keys on them (see above).
;;; In particular, extraction does not care about file formats or other such things.
;;;
;;; Storage takes the stream from extraction and actually stores it or sends it. Traditionally we have serialized to a
;;; directory tree full of YAML files, and that's the only storage approach implemented here. But since the process is
;;; decoupled, we or a user could write their own storage layer, using JSON or protocol buffers or any other format.
;;;
;;; Both extraction and storage are written as a set of multimethods, with defaults for the common path.
;;; Note that extraction is controlled by a map of options and settings, detailed below.
;;;
;;; Extraction:
;;; - Top-level serialization code [[metabase-enterprise.serialization.v2.extract/extract-metabase]] has a list of
;;;   models to be exported.
;;;     - A test enforces that all models are either exported, or explicitly excluded, so new ones can't be forgotten.
;;; - It calls `(extract-all "ModelName" opts)` for each model.
;;;     - The default for this calls `(extract-query "ModelName" opts)`, getting back a reducible stream of entities.
;;;     - For each entity in that stream, it calls `(extract-one "ModelName" entity)`, which converts the map from the
;;;       database to a portable map with `:serdes/meta` on it. Eg. no database IDs as foreign keys.
;;; - The default [[extract-all]] should work for most models (overrride [[extract-query]] and [[extract-one]] instead),
;;;   but it can be overridden if needed.
;;;
;;; The end result of extraction is a reducible stream of Clojure maps; this is passed to storage directly, along with
;;; the map of options.
;;;
;;; Options currently supported by extraction:
;;; - `:user 6` giving the primary key for a user whose personal collections should be extracted.
;;;
;;; Storage:
;;; The storage system might transform that stream in some arbitrary way. Storage is a dead end - it should perform side
;;; effects like writing to the disk or network, and return nothing.
;;;
;;; Not all storage solutions use directory structure, but for those that do, [[storage-path]] should give the path as
;;; a list of strings: `["foo" "bar" "some_file"]`. Note the lack of a file extension on the last segment - that
;;; is deliberately left off so that no filename surgery is required to support eg. both JSON and YAML output.
;;;
;;; By convention, models are named as plural and in lower case:
;;; `["collections" "1234ABC_my_collection" "dashboards" "8765def_health_metrics"]`.
;;;
;;; As a final remark, note that some entities have their own directories and some do not. For example a Field is
;;; simply a file, while a Table has a directory. So a Table's itself is
;;; `["databases" "some-db" "schemas" "PUBLIC" "tables" "Customer" "Customer"]`
;;; so that's a directory called `Customer` with a file called (for YAML output) `Customer.yaml` in it.
;;;
;;; Selective Serialization:
;;; Sometimes we want to export a "subtree" instead of the complete appdb. At the simplest, we might serialize a single
;;; question. Moving up, it might be a Dashboard and all its questions, or a Collection and all its content Cards and
;;; Dashboards.
;;; There's a relation to be captured here: the *descendants* of an entity are the ones it semantically "contains" (or
;;; those it needs in order to be executed, such as when questions depend on each other, or NativeQuerySnippets are
;;; referenced by a SQL question.
;;;
;;; (serdes-descendants entity) returns a set of such descendants for the given entity (in its exported form); see that
;;; multimethod for more details.
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

  Defaults to using `(toucan.db/select model)` for the entire table.

  You may want to override this to eg. skip archived entities, or otherwise filter what gets serialized."
  {:arglists '([model-name opts])}
  (fn [model-name _opts] model-name))

(defmulti extract-one
  "Extracts a single entity retrieved from the database into a portable map with `:serdes/meta` attached.
  `(extract-one \"ModelName\" opts entity)`

  The default implementation uses [[serdes-generate-path]] to build the `:serdes/meta`. It also strips off the
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

(defmethod extract-all :default [model opts]
  (eduction (map (partial extract-one model opts))
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
  - Add `:serdes/meta` by calling [[serdes-generate-path]].
  - Drop the primary key.
  - Drop :updated_at; it's noisy in git and not really used anywhere.

  Returns the Clojure map."
  [model-name entity]
  (let [model (db/resolve-model (symbol model-name))
        pk    (models/primary-key model)]
    (-> (into {} entity)
        (assoc :serdes/meta (serdes-generate-path model-name entity))
        (dissoc pk :updated_at))))

(defmethod extract-one :default [model-name _opts entity]
  (extract-one-basics model-name entity))

(defmulti serdes-descendants
  "Captures the notion that eg. a dashboard \"contains\" its cards.
  Returns a set, possibly empty or nil, of `[model-name database-id]` pairs for all entities that this entity contains
  or requires to be executed.
  Dispatches on the model name.

  For example:
  - a `Collection` contains 0 or more other `Collection`s plus many `Card`s and `Dashboard`s;
  - a `Dashboard` contains its `DashboardCard`s;
  - each `DashboardCard` contains its `Card`;
  - a `Card` might stand alone, or it might require `NativeQuerySnippet`s or other `Card`s as inputs; and
  - a `NativeQuerySnippet` similarly might derive from others;

  A transitive closure over [[serdes-descendants]] should thus give a complete \"subtree\", such as a complete
  `Collection` and all its contents.

  A typical implementation will run a query or two to collect eg. all `DashboardCard`s that are part of this
  `Dashboard`, and return them as pairs like `[\"DashboardCard\" 17]`.

  What about [[serdes-dependencies]]?
  Despite the similar-sounding names, this differs crucially from [[serdes-dependencies]]. [[serdes-descendants]] finds
  all entities that are \"part\" of the given entity.

  [[serdes-dependencies]] finds all entities that need to be loaded into appdb before this one can be, generally because
  this has a foreign key to them. The arrow \"points the other way\": [[serdes-dependencies]] points *up* -- from a
  `Dashboard` to its containing `Collection`, `Collection` to its parent, from a `DashboardCard` to its `Dashboard` and
  `Card`. [[serdes-descendants]] points *down* to contents, children, and components."
  {:arglists '([model-name db-id])}
  (fn [model-name _] model-name))

(defmethod serdes-descendants :default [_ _]
  nil)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Deserialization Process                                                |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; Deserialization is split into two stages, mirroring serialization. They are called ingestion and loading.
;;; Ingestion turns whatever serialized form (eg. a tree of YAML files) was produced by storage into Clojure maps with
;;; `:serdes/meta` maps. Loading imports those entities into the appdb, updating and inserting rows as needed.
;;;
;;; Ingestion:
;;; Ingestion is intended to be a black box, like storage above. [[Ingestable]] is a protocol to allow easy [[reify]]
;;; usage for testing in-memory deserialization.
;;;
;;; Factory functions consume some details (like a file path) and return an [[Ingestable]], with its two methods:
;;; - `(ingest-list ingestable)` returns a reducible stream of `:serdes/meta` paths in any order.
;;; - `(ingest-one ingestable meta-path)` ingests a single entity into memory, returning it as a map.
;;;
;;; This two-stage design avoids needing all the data in memory at once, where that's practical with the underlying
;;; storage media (eg. files).
;;;
;;; Loading:
;;; Loading tries to find corresponding entities in the destination appdb by entity ID or identity hash, and update
;;; those rows rather than duplicating.
;;; The entry point is [[metabase-enterprise.serialization.v2.load/load-metabase]]. The top-level process works like
;;; this:
;;; - `(ingest-list ingestable)` gets the `:serdes/meta` "path" for every exported entity in arbitrary order.
;;;     - `(ingest-one meta-map opts)` is called on each first to ingest the value into memory, then
;;;     - `(serdes-dependencies ingested)` to get a list of other paths that need to be loaded first.
;;;         - The default is an empty list.
;;;     - The idea of dependencies is eg. a database must be loaded before its tables, a table before its fields, a
;;;       collection's ancestors before the collection itself.
;;;     - Dependencies are loaded recursively in postorder; circular dependencies cause the process to throw.
;;; - Having found an entity it can really load, check for any existing one:
;;;     - `(load-find-local path)` returns the corresponding entity, or nil.
;;; - Then it calls `(load-one! ingested maybe-local-entity)`, passing the `ingested` value and either `nil` or the
;;;       Toucan entity corresponding to the incoming map.
;;;     - `load-one!` is a side-effecting black box to the rest of the deserialization process.
;;;       It returns the primary key of the new or existing entity, which is necessary to resolve foreign keys between
;;;       imported entities.
;;;     - The table of "local" entities found by the prescan is updated to include newly loaded ones.
;;;
;;;
;;; `load-one!` has a default implementation that works for most models:
;;; - Call `(load-xform ingested)` to massage the map as needed.
;;;     - This is the spot to override, for example to convert a foreign key from portable entity ID into a database ID.
;;; - Then, call either:
;;;     - `(load-update! ingested local-entity)` if the local entity exists, or
;;;     - `(load-insert! ingested)` if the entity is new.
;;;   Both of these have the obvious defaults of [[jdbc/update!]] or [[jdbc/insert!]].
(defn- ingested-model
  "The dispatch function for several of the load multimethods: dispatching on the model of the incoming entity."
  [ingested]
  (-> ingested :serdes/meta last :model))

(defn serdes-path
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
  [[serdes.hash/identity-hash]] to primary keys, since the identity hash cannot be queried directly.
  This cache is cleared at the beginning and end of the deserialization process."
  {:arglists '([path])}
  (fn [path]
    (-> path last :model)))

(declare lookup-by-id)

(defmethod load-find-local :default [path]
  (let [{id :id model-name :model} (last path)
        model                      (db/resolve-model (symbol model-name))]
    (when model
      (lookup-by-id model id))))

(defmulti serdes-dependencies
  "Given an entity map as ingested (not a Toucan entity) returns a (possibly empty) list of its dependencies, where each
  dependency is represented by its abstract path (its `:serdes/meta` value).

  Keyed on the model name for this entity.
  Default implementation returns an empty vector, so only models that have dependencies need to implement this."
  {:arglists '([ingested])}
  ingested-model)

(defmethod serdes-dependencies :default [_]
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

  Defaults to a straightforward [[db/update!]], and you may not need to update it.

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the updated entity."
  {:arglists '([model-name ingested local])}
  (fn [model _ _] model))

(defmethod load-update! :default [model-name ingested local]
  (let [model    (db/resolve-model (symbol model-name))
        pk       (models/primary-key model)
        id       (get local pk)]
    (log/tracef "Upserting %s %d: old %s new %s" model-name id (pr-str local) (pr-str ingested))
    (db/update! model id ingested)
    (db/select-one model pk id)))

(defmulti load-insert!
  "Called by the default [[load-one!]] if there is no corresponding entity already in the appdb.
  `(load-insert! \"ModelName\" ingested-and-xformed)`

  Defaults to a straightforward [[db/insert!]], and you probably don't need to implement this.

  Note that any [[db/insert!]] behavior we don't want to run (like generating an `:entity_id`!) should be skipped based
  on the [[mi/*deserializing?*]] dynamic var.

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the newly inserted entity."
  {:arglists '([model ingested])}
  (fn [model _] model))

(defmethod load-insert! :default [model-name ingested]
  (log/tracef "Inserting %s: %s" model-name (pr-str ingested))
  (db/insert! (symbol model-name) ingested))

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
       (into [] (comp (filter #(= id-hash (serdes.hash/identity-hash %)))
                      (take 1)))
       first))

(defn lookup-by-id
  "Given an ID string, this endeavours to find the matching entity, whether it's an entity ID or identity hash.
  This is useful when writing [[load-xform]] to turn a foreign key from a portable form to an appdb ID.
  Returns a Toucan entity or nil."
  [model id-str]
  (if (entity-id? id-str)
    (db/select-one model :entity_id id-str)
    (find-by-identity-hash model id-str)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Storage                                                         |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; These storage multimethods take a second argument known as the context. This is a good place for a particular
;;; storage implementation to include some precomputed information, or options.
;;; In particular, it should include a table of collection IDs to path fragments that is precomputed by the host.
;;; [[storage-base-context]] computes that, since many things go in a collections tree.
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
  (let [{:keys [model id label]} (-> entity serdes-path last)]
    (concat ["collections"]
            (get collections (:collection_id entity)) ;; This can be nil, but that's fine - that's the root collection.
            [(lower-plural model) (storage-leaf-file-name id label)])))

(defmulti storage-path
  "Computes the complete storage path for a given entity.
  `(storage-path entity ctx)`
  Dispatches on the model name, eg. \"Dashboard\".

  Returns a list of strings giving the path, with the final entry being the file name with no extension.

  The default implementation works for entities which are:
  - Part of the regular (not snippet) collections tree, per a :collection_id field; and
  - Stored as `foos/1234abc_slug.extension` underneath their collection
  eg. Cards, Dashboards, Timelines

  The default logic is captured by [[storage-default-collection-path]] so it can be reused."
  {:arglists '([entity ctx])}
  (fn [entity _] (ingested-model entity)))

(defmethod storage-path :default [entity ctx]
  (storage-default-collection-path entity ctx))

(defn storage-base-context
  "Creates the basic context for storage. This is a map with a single entry: `:collections` is a map from collection ID
  to the path of collections."
  []
  (let [colls      (db/select ['Collection :id :entity_id :location :slug])
        coll-names (into {} (for [{:keys [id entity_id slug]} colls]
                              [(str id) (storage-leaf-file-name entity_id slug)]))
        coll->path (into {} (for [{:keys [entity_id id location]} colls
                                  :let [parents (rest (str/split location #"/"))]]
                              [entity_id (map coll-names (concat parents [(str id)]))]))]
    {:collections coll->path}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Ingestion                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+
(defonce ^:private ingest-path-matchers (atom {}))

(defn ingest-path
  "Transforms a file path (as a sequence of strings with no file extension on the last part) into a `:serdes/meta`
  hierarchy, or nil if nothing matches.

  The set of matchers is maintained in an atom, and each model should call [[register-ingestion-path!]] to add its
  matcher.

  Note that the input format is the same as the return value of [[storage-path]]."
  [path]
  (first (keep #(% path) (vals @ingest-path-matchers))))

(defn register-ingestion-path!
  "Registers the matcher for the given model. Expects the model name to be a string.
  The matcher is a function from a path (see [[ingest-path]] for the format) to a `:serdes/meta` hierarchy, or nil
  if there's no match."
  [model-name matcher]
  (swap! ingest-path-matchers assoc model-name matcher)
  ;; Return a readable symbol so this call shows up nicely when (a buffer containing) a register-ingestion-path! call
  ;; is evaluated at the REPL.
  ['register-ingestion-path! model-name])

(defn split-leaf-file-name
  "Given a leaf file name of the type generated by [[storage-leaf-file-name]], break it apart into an [id slug] pair,
  where the slug might be nil."
  [file]
  (when-let [[_ id slug] (or (re-matches #"^([A-Za-z0-9_\.:-]{21})_(.*)$" file)    ; entity_id and slug
                             (re-matches #"^([A-Za-z0-9_\.:-]{21})$"      file)    ; entity_id only
                             (re-matches #"^([a-fA-F0-9]{8})_(.*)$"       file)    ; Hash and slug
                             (re-matches #"^([a-fA-F0-9]{8})$"            file))]  ; Hash only
    [id slug]))

(defn ingestion-matcher-collected
  "A helper for the common case of paths like `collections/some/nested/collections/model-name/entityID_slug`.
  Expects the (lowercase) first segment, and the model name (eg. \"Dashboard\", not \"dashboards\" as it appears in
  the path).
  For example `(ingestion-matcher-collected \"collections\" \"Card\")`.

  Returns a matcher function.
  The resulting hierarchy is "
  [first-segment model-name]
  (fn [path]
    (let [head         (first path)
          [model file] (take-last 2 path)]
      (when-let [[id slug] (and (= head first-segment)
                                (= model (lower-plural model-name))
                                (split-leaf-file-name file))]
        (cond-> {:model model-name :id id}
          slug (assoc :label slug)
          true vector)))))

(defn- match-pairs [path pattern]
  (let [chunks (take (count pattern) (partition 2 path))]
    (when (= pattern (map first chunks))
      (reduce (fn [out [k v]] (assoc out k v)) {} chunks))))

(defn ingestion-matcher-pairs
  "A helper for the common case of paths like `databases/my-db/schemas/my-schema/tables/my-table` which alternate
  fixed and arbitrary segments.
  The input is a *list* of sequences like `[[\"databases\" \"schemas\" \"tables\"] [\"databases\" \"tables\"]]` and the
  response is a map of those fixed tokens as keys to the following segment as values, eg.
  `{\"databases\" \"my-db\"  \"schemas\" \"my-schema\"  \"tables\" \"my-table\"}`.
  This matches a *prefix*, not necessarily the entire sequence."
  [path patterns]
  (some (partial match-pairs path) patterns))
