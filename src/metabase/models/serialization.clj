(ns metabase.models.serialization
  "Defines several helper functions and multimethods for the serialization system.
  Serialization is an enterprise feature, but in the interest of keeping all the code for an entity in one place, these
  methods are defined here and implemented for all the exported models.

  Whether to export a new model:
  - Generally, the high-profile user facing things (databases, questions, dashboards, snippets, etc.) are exported.
  - Internal or automatic things (users, activity logs, permissions) are not.

  If the model is not exported, add it to the exclusion lists in the tests. Every model should be explicitly listed as
  exported or not, and a test enforces this so serialization isn't forgotten for new models."
  (:refer-clojure :exclude [descendants])
  (:require
   [cheshire.core :as json]
   [clojure.core.match :refer [match]]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.db :as mdb]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.interface :as mi]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util :as u]
   [metabase.util.connection :as u.conn]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

;;; # Serialization Overview
;;;
;;; Serialization (or "serdes") is a system for exporting entities (Dashboards, Cards, Collections, etc.) from one
;;; Metabase instance to disk files, and later importing them into 1 or more separate Metabase instances.
;;;
;;; There are two versions of serdes, known as v1 and v2. v2 was built in late 2022 to solve some problems with v1,
;;; especially: accidentally duplicating entities because of a human change like renaming a collection; and that several
;;; newly added models (eg. Timelines) were not added to serdes. v1's code is in `metabase-enterprise.serialization.*`;
;;; v2 is split between infrastructure in `metabase-enterprise.serialization.v2.*` and integration with each model in
;;; `metabase.models.*`.
;;;
;;; There are tests which query the set of Toucan models and ensure that they either support serialization or are
;;; explicitly listed as exempt. Therefore serdes for new models is not forgotten.
;;;
;;; ## More details
;;; This file is probably best not read top to bottom - it's organized in `def` order, not necessarily a good order for
;;; understanding. Probably you want to read below on the "Export process" and "Import process" next.


;;; # Entity IDs
;;; Every serializable entity needs the be identified in a way that is:
;;;
;;; 1. unique, at least among the serialized entities
;;; 2. permanent, even if eg. a collection's `:name` changes
;;; 3. portable between Metabase instances and over time
;;;
;;; Database primary keys fail (3); matching based on the value fails (2) and maybe (1). So there's no easy way to solve
;;; this requirement. We've taken three approaches for different kinds of entities:
;;;
;;; 1. Some have unique names already and we can use those: Databases are uniquely named and don't change.
;;;     - Some are unique within a namespace: Fields are unique in Tables, Tables in Schemas, Schemas in Databases.
;;; 2. Some are "embedded" as part of a parent entity, and don't need to exist independently, eg. the recipients of a
;;;    pulse/dashboard subscription are reduced to a list of email addresses.
;;; 3. For everything else (Dashboards, Cards, etc.)
;;;    - Add an `entity_id` column to the tables
;;;    - Populate it `on-insert` with a randomly-generated NanoID like `"V1StGXR8_Z5jdHi6B-myT"`.
;;;    - For entities that existed before the column was added, have a portable way to rebuild them (see below on
;;;      hashing).

(def ^:private ^:dynamic *current* "Instance/map being exported/imported currently" nil)

(defmulti entity-id
  "Given the model name and an entity, returns its entity ID (which might be nil).

  This abstracts over the exact definition of the \"entity ID\" for a given entity.
  By default this is a column, `:entity_id`.

  Models that have a different portable ID (`Database`, `Field`, etc.) should override this."
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defmethod entity-id :default [_ instance]
  (some-> instance :entity_id str/trim))

(defn eid->id
  "Given model name and its entity id, returns it database-local id.

  Is kind of reverse transformation to `entity-id` function defined here.

  NOTE: Not implemented for `Database`, `Table` and `Field`, since those rely more on `path` than a single id. To be
  done if a need arises."
  [model-name eid]
  (let [model (keyword "model" model-name)
        pk    (first (t2/primary-keys model))
        eid   (cond-> eid
                (str/starts-with? eid "eid:") (subs 4))]
    (t2/select-one-fn pk [model pk] :entity_id eid)))

;;; ## Hashing entities
;;; In the worst case, an entity is already present in two instances linked by serdes, and it doesn't have `entity_id`
;;; set because it existed before we added the column. If we write a migration to just generate random `entity_id`s on
;;; both sides, those entities will get duplicated on the next `import`.
;;;
;;; So every entity implements [[hash-fields]], which determines the set of fields whose values are used to generate the
;;; hash. The 32-bit [[identity-hash]] is then used to seed the PRNG and generate a "random" NanoID. Since this is based
;;; on properties of the entity, it is reproducible on both `export` and `import` sides, so entities are not duplicated.
;;;
;;; Before any `export` or `import`, [[metabase-enterprise.serialization.v2.backfill-ids/backfill-ids]] is called. It
;;; does `SELECT * FROM SomeModel WHERE entity_id IS NULL` and populates all the blanks with this hash-based NanoID.
;;;
;;; <h3>Whoops, two kinds of backfill</h3>
;;; Braden discovered in Nov 2023 that for more than a year, we've had two inconsistent ways to backfill all the
;;; `entity_id` fields in an instance.
;;;
;;; 1. The one described above, [[metabase-enterprise.serialization.v2.backfill-ids/backfill-ids]] which runs before
;;;    any export or import.
;;; 2. A separate JAR command `seed_entity_ids` which is powered by
;;;    [[metabase-enterprise.serialization.v2.entity-ids/seed-entity-ids!]] and uses the [[identity-hash]] hex strings
;;;    directly rather than seeding a NanoID with them.
;;;
;;; Therefore the import machinery has to look out for both kinds of IDs and use them. This is foolish and should be
;;; simplified. We should write a Clojure-powered migration that finds any short 8-character `entity_id`s and generates
;;; NanoIDs from them.

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
  "Returns an identity hash string (8 hex digits) from an `entity` map.

  This string is generated by:
  - calling [[hash-fields]] for the model
  - passing the `entity` to each function it returns
  - calling [[hash]] on that list
  - converting to an 8-character hex string"
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
   the value of the hydrated property under key k.

  This is a helper for writing [[hash-fields]] implementations."
  [k]
  (fn [entity]
    (or
     (some-> entity (t2/hydrate k) (get k) identity-hash)
     "<none>")))

;;; # Serdes paths and <tt>:serdes/meta</tt>
;;; The Clojure maps from extraction and ingestion always include a special key `:serdes/meta` giving some information
;;; about the serialized entity. The value is always a vector of maps that give a "path" to the entity. This is **not**
;;; a filesystem path; rather it defines the nesting of some entities inside others.
;;;
;;; Most paths are a single layer:
;;; `[{:model "ModelName" :id "entity ID" :label "Human-readonly name"}]`
;;; where `:model` and `:id` are required, and `:label` is optional.
;;;
;;; But for some entities, it can be deeper. For example, Fields belong to Tables, which are in Schemas, which are in
;;; Databases. (Schemas don't exist separately in the appdb, but they're used here to keep Table names unique.)
;;; For example:
;;; <pre><code>[{:model "Database" :id "my_db"}
;;;  {:model "Schema"   :id "PUBLIC"}
;;;  {:model "Table"    :id "Users"}
;;;  {:model "Field"    :id "email"}]</code></pre>
;;;
;;; Many of the serdes multimethods are keyed on the `:model` field of the leaf entry (the last).
;;;
;;; ## Two kinds of nesting
;;; To reiterate, `:serdes/meta` paths are not filesystem paths. When `extract`ed entities are stored to disk.

(defmulti generate-path
  "Given the model name and raw entity from the database, returns a vector giving its *path*.
  `(generate-path \"ModelName\" entity)`

  The path is a vector of maps, root first and this entity itself last. Each map looks like:
  `{:model \"ModelName\" :id \"entity ID, identity hash, or custom ID\" :label \"optional human label\"}`

  Nested models with no entity_id need to return nil for generate-path."
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defn infer-self-path
  "Returns `{:model \"ModelName\" :id \"id-string\"}`"
  [model-name entity]
  (let [model (t2.model/resolve-model (symbol model-name))
        pk    (first (t2/primary-keys model))]
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
        label (slug-key entity)]
    [(-> self
         (m/assoc-some :label (some-> label (u/slugify {:unicode? true}))))]))

(defmethod generate-path :default [model-name entity]
  ;; This default works for most models, but needs overriding for those that don't rely on entity_id.
  (maybe-labeled model-name entity :name))

;;; # Export Process
;;; An *export* (writing a Metabase instance's entities to disk) happens in two stages: *extraction* and *storage*.
;;; These are independent, and deliberately decoupled. The result of extraction is a reducible stream of Clojure maps,
;;; each with `:serdes/meta` keys on them (see below about these paths). In particular, note that extraction happens
;;; inside Clojure, and has nothing to do with file formats or anything of the kind.
;;;
;;; Storage takes the stream of extracted entities and actually stores it to disk or sends it over the network.
;;; Traditionally we serialize to a directory of YAML files, and that's the only storage approach currently implemented.
;;; But since the export process is split into (complicated) extraction and (straightforward) storage, we or a user
;;; could write a new storage layer fairly easily if we wanted to use JSON, protocol buffers, or any other format.
;;;
;;; Both extraction and storage are written as a set of multimethods, with defaults for the common case.
;;;
;;; ## Extraction
;;; Extraction is controlled by a map of options and settings, with details below.
;;;
;;; - [[metabase-enterprise.serialization.v2.models/exported-models]] gives the set of models to be exported.
;;;     - A test enforces that all models are either exported or explicitly excluded, so we can't forget serdes for new
;;;       models.
;;; - [[metabase-enterprise.serialization.v2.extract/extract]] is the entry point for extraction.
;;;     - It can work in a "selective" mode or extract everything; see below on selective serialization.
;;; - It calls `(extract-all "ModelName" opts)` for each model.
;;;     - By default this calls `(extract-query "ModelName" opts)`, getting back a reducible stream of entities.
;;;     - For each entity in that stream, it calls `(extract-one "ModelName" entity)`, which converts the map from the
;;;       database (with instance-specific FKs in it) to a portable map with `:serdes/meta` on it and all FKs replaced
;;;       with portable references.
;;;
;;; The default [[extract-all]] works for nearly all models. Override [[extract-query]] if you need to control which
;;; entities get serialized (eg. to exclude `archived` ones). Every model implements [[extract-one]] to make its
;;; entities portable.
;;;
;;; ## Storage
;;; Storage transforms the reducible stream in some arbitrary way. It returns nothing; storage is expected to have side
;;; effects like writing files to disk or transmitting them over the network.
;;;
;;; Not all storage implementations use directory structure, but for those that do [[storage-path]] should give the path
;;; for an entity as a list of strings: `["foo" "bar" "some_file"]`. Note the lack of a file extension! That is
;;; deliberately left off the shared [[storage-path]] code so it can be set by different implementations to `.yaml`,
;;; `.json`, etc.
;;;
;;; By convention, models are named as *plural* and in *lower case*:
;;; `["collections" "1234ABC_my_collection" "dashboards" "8765def_health_metrics"]`.
;;;
;;; As a final remark, note that some entities have their own directories and some do not. For example, a Field is
;;; simply a file, while a Table has a directory. So a subset of the tree might look something like this:
;;; <pre><code>my-export/
;;; ├── collections
;;; └── databases
;;;     └── Sample Database
;;;         ├── Sample Database.yaml
;;;         └── schemas
;;;             └── PUBLIC
;;;                 └── tables
;;;                     └── ORDERS
;;;                         ├── ORDERS.yaml
;;;                         └── fields
;;;                             ├── CREATED_AT.yaml
;;;                             ├── DISCOUNT.yaml
;;;                             ├── ID.yaml
;;;                             ├── PRODUCT_ID.yaml
;;;                             ├── QUANTITY.yaml
;;;                             ├── SUBTOTAL.yaml
;;;                             ├── TAX.yaml
;;;                             ├── TOTAL.yaml
;;;                             └── USER_ID.yaml
;;; </code></pre>
;;;
;;; ## Selective serialization
;;; It's common to only export certain entities from an instance, rather than everything. We might export a single
;;; Question, or a Dashboard with all its DashboardCards and their Cards.
;;;
;;; There's a relation to be captured here: the *descendants* of an entity are the ones it semantically "contains", or
;;; those it needs in order to be executed. (As when a question depends on another, or a SQL question references a
;;; NativeQuerySnippet.
;;;
;;; [[descendants]] returns a set of such descendants for a given entity; see there for more details.
;;;
;;; *Note:* "descendants" and "dependencies" are quite different things!

(defmulti make-spec
  "Return specification for serialization. This should be a map of three keys: `:copy`, `:skip`, `:transform`.

  `:copy` and `:skip` are vectors of field names. `:skip` is only used in tests to check that all fields were
  mentioned.

  `:transform` is a map from field name to a `{:ser (fn [v] ...) :des (fn [v] ...)}` map with functions to
  serialize/deserialize data.

  For behavior, see `extract-by-spec` and `xform-by-spec`."
  (fn [model-name _opts] model-name))

(defmethod make-spec :default [_ _] nil)

(defn- extract-by-spec [model-name opts instance]
  (try
    (binding [*current* instance]
      (when-let [spec (make-spec model-name opts)]
        (-> (select-keys instance (:copy spec))
            ;; won't assoc if `generate-path` returned `nil`
            (m/assoc-some :serdes/meta (generate-path model-name instance))
            (into (for [[k transform] (:transform spec)
                        :let [res ((:export transform) (get instance k))]
                        ;; include only non-nil transform results
                        :when res]
                    [k res])))))
    (catch Exception e
      (throw (ex-info (format "Error extracting %s %s" model-name (:id instance))
                      (assoc (ex-data e) :model model-name :id (:id instance))
                      e)))))

(defmulti extract-all
  "Entry point for extracting all entities of a particular model:
  `(extract-all \"ModelName\" {opts...})`
  Keyed on the model name.

  Returns a **reducible stream** of extracted maps (ie. vanilla Clojure maps with `:serdes/meta` keys).

  You probably don't want to implement this directly. The default implementation delegates to [[extract-query]] and
  [[extract-one]], which are usually more convenient to override."
  {:arglists '([model-name opts])}
  (fn [model-name _opts] model-name))

(defmulti extract-query
  "Performs the select query, possibly filtered, for all the entities of this model that should be serialized. Called
  from [[extract-all]]'s default implementation.

  `(extract-query \"ModelName\" opts)`

  Keyed on the model name, the first argument.

  Returns a **reducible stream** of modeled Toucan maps.

  Defaults to using `(t2/select model)` for the entire table.

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
  - Convert to a vanilla Clojure map, not a modeled Toucan 2 entity.
  - Drop the numeric database primary key (usually `:id`)
  - Replace any foreign keys with portable values (eg. entity IDs, or a user ID with their email, etc.)

  When overriding this, [[extract-one-basics]] is probably a useful starting point.

  Keyed by the model name of the entity, the first argument."
  {:arglists '([model-name opts instance])}
  (fn [model-name _opts _instance] model-name))

(defn log-and-extract-one
  "Extracts a single entity; will replace `extract-one` as public interface once `extract-one` overrides are gone."
  [model opts instance]
  (log/infof "Extracting %s %s %s" model (:id instance) (entity-id model instance))
  (try
    (extract-one model opts instance)
    (catch Exception e
      (when-not (or (:skip (ex-data e))
                    (:continue-on-error opts))
        (throw (ex-info (format "Exception extracting %s %s" model (:id instance))
                        {:model     model
                         :id        (:id instance)
                         :entity_id (:entity_id instance)
                         :cause     (.getMessage e)}
                        e)))
      (log/warnf "Skipping %s %s because of an error extracting it: %s %s"
                 model (:id instance) (.getMessage e) (dissoc (ex-data e) :skip))
      ;; return error as an entity so it can be used in the report
      e)))

(defmethod extract-all :default [model opts]
  (eduction (map (partial log-and-extract-one model opts))
            (extract-query model opts)))

(defn extract-query-collections
  "Helper for the common (but not default) [[extract-query]] case of fetching everything that isn't in a personal
  collection."
  [model {:keys [collection-set where]}]
  (if collection-set
    ;; If collection-set is defined, select everything in those collections, or with nil :collection_id.
    (t2/reducible-select model {:where [:or
                                        [:in :collection_id collection-set]
                                        (when (contains? collection-set nil)
                                          [:= :collection_id nil])
                                        (when where
                                          where)]})
    ;; If collection-set is nil, just select everything.
    (t2/reducible-select model {:where (or where true)})))

(defmethod extract-query :default [model-name {:keys [where]}]
  (t2/reducible-select (symbol model-name) {:where (or where true)}))

(defn extract-one-basics
  "A helper for writing [[extract-one]] implementations. It takes care of the basics:
  - Convert to a vanilla Clojure map.
  - Add `:serdes/meta` by calling [[generate-path]].
  - Drop the primary key.
  - Drop :updated_at; it's noisy in git and not really used anywhere.

  Returns the Clojure map."
  [model-name entity]
  (let [model (t2.model/resolve-model (symbol model-name))
        pk    (first (t2/primary-keys model))]
    (-> (into {} entity)
        (m/update-existing :entity_id str/trim)
        (assoc :serdes/meta (generate-path model-name entity))
        (dissoc pk :updated_at))))

(defmethod extract-one :default [model-name opts entity]
  ;; `extract-by-spec` is called here since most of tests use `extract-one` right now
  (or (extract-by-spec model-name opts entity)
      (extract-one-basics model-name entity)))

(defmulti descendants
  "Returns set of `[model-name database-id]` pairs for all entities contained or used by this entity. e.g. the Dashboard
   implementation should return pairs for all DashboardCard entities it contains, etc.

   Dispatched on model-name."
  {:arglists '([model-name db-id])}
  (fn [model-name _] model-name))

(defmethod descendants :default [_ _]
  nil)

(defmulti ascendants
  "Return set of `[model-name database-id]` pairs for all entities containing this entity, required to successfully
  load this entity in destination db. Notice that ascendants are searched recursively, but their descendants are not
  analyzed.

  Dispatched on model-name."
  {:arglists '([model-name db-id])}
  (fn [model-name _] model-name))

(defmethod ascendants :default [_ _]
  nil)

;;; # Import Process
;;; Deserialization is split into two stages, mirroring serialization. They are called *ingestion* and *loading*.
;;; Ingestion turns whatever serialized form was produced by storage (eg. a tree of YAML files) into Clojure maps with
;;; `:serdes/meta` maps. Loading imports these entities into the appdb, updating and inserting rows as needed.
;;;
;;; ## Ingestion
;;; Ingestion is intended to be a black box, like storage above.
;;; [[metabase-enterprise.serialization.v2.ingest/Ingestable]] is defined as a protocol to allow easy [[reify]] usage
;;; for testing deserialization in memory.
;;;
;;; Factory functions consume some details (like a path to the export) and return an `Ingestable` instance, with its
;;; two methods:
;;;
;;; - `(ingest-list ingestable)` returns a reducible stream of `:serdes/meta` paths in any order.
;;; - `(ingest-one ingestable meta-path)` ingests a single entity into memory, returning it as a map.
;;;
;;; This two-stage design avoids needing all the data in memory at once. (Assuming the underlying storage media is
;;; something like files, and not a network stream that won't wait!)
;;;
;;; ## Loading
;;; Loading tries to find, for each ingested entity, a corresponding entity in the destination appdb, using the entity
;;; IDs. If it finds a match, that row will be `UPDATE`d, rather than `INSERT`ing a duplicate.
;;;
;;; The entry point is [[metabase-enterprise.serialization.v2.load/load-metabase]].
;;;
;;; First, `(ingest-list ingestable)` gets the `:serdes/meta` "path" for every exported entity in arbitrary order.
;;; Then for each ingested entity:
;;;
;;; - `(ingest-one serdes-path opts)` is called to read the value into memory, then
;;; - `(dependencies ingested)` gets a list of other `:serdes/meta` paths need to be loaded first.
;;;     - See below on depenencies.
;;; - Dependencies are loaded recursively in postorder; that is an entity is loaded after all its deps.
;;;     - Circular dependencies will make the load process throw.
;;; - Once an entity's deps are all loaded, we check for an existing one:
;;;     - `(load-find-local serdes-path)` returns the corresponding entity, or nil.
;;; - `(load-one! ingested maybe-local-entity)` is called with the `ingested` map and `nil` or the local match.
;;;     - `load-one!` is a side-effecting black box to the rest of the deserialization process.
;;;     - `load-one! returns the primary key of the new or existing entity, which is necessary to resolve foreign keys.
;;;
;;; `load-one!` has a default implementation that works for most models:
;;;
;;; - Call `(load-xform ingested)` to transform the ingested map as needed.
;;;     - Override [[load-xform]] to convert any foreign keys from portable entity IDs to the local database FKs.
;;; - Then call either:
;;;     - `(load-update! ingested local-entity)` if the local entity exists, or
;;;     - `(load-insert! ingested)` if it's new.
;;;
;;; Both `load-update!` and `load-insert!` have the obvious defaults of updating or inserting with Toucan, but they
;;; can be overridden if special handling is needed.

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

  By default, this tries to look up the entity by its `:entity_id` column."
  {:arglists '([path])}
  (fn [path]
    (-> path last :model)))

(declare lookup-by-id)

(defmethod load-find-local :default [path]
  (let [{id :id model-name :model} (last path)
        model                      (t2.model/resolve-model (symbol model-name))]
    (when model
      (lookup-by-id model id))))

;;; ## Dependencies
;;; The files of an export are returned in arbitrary order by [[ingest-list]]. But in order to load any entity,
;;; everything it has a foreign key to must be loaded first. This is the purpose of one of the most complicated parts of
;;; serdes: [[dependencies]].
;;;
;;; This multimethod returns a list (possibly empty) of `:serdes/meta` paths that this entity depends on. A `Card`
;;; depends on the `Table`s it queries, the `Collection` it belongs to, and possibly much else.
;;; Collections depend (recursively) on their parent collections.
;;;
;;; **Think carefully** about the dependencies of any model. Do they have optional fields that sometimes have FKs?
;;; Eg. a DashboardCard can contain custom `click_behavior` which might include linking to a different `Card`!
;;; Missing dependencies will cause flaky deserialization failures, since sometimes the FK target will exist already,
;;; and sometimes not, depending on the arbitrary order of `ingest-list`.

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
  [[t2/insert!]]).
  For example, this should convert any foreign keys back from a portable entity ID or identity hash into a numeric
  database ID. This is the mirror of [[extract-one]], in spirit. (They're not strictly inverses - [[extract-one]] drops
  the primary key but this need not put one back, for example.)

  By default, this just calls [[load-xform-basics]].
  If you override this, call [[load-xform-basics]] as well."
  {:arglists '([ingested])}
  ingested-model)

(def ^:private fields-for-table
  "Given a table name, returns a map of column_name -> column_type"
  (mdb/memoize-for-application-db
   (fn fields-for-table [table-name]
     (u.conn/app-db-column-types (mdb/app-db) table-name))))

(defn- ->table-name
  "Returns the table name that a particular ingested entity should finally be inserted into."
  [ingested]
  (->> ingested ingested-model (keyword "model") t2/table-name))

(defmulti ingested-model-columns
  "Called by `drop-excess-keys` (which is in turn called by `load-xform-basics`) to determine the full set of keys that
  should be on the map returned by `load-xform-basics`. The default implementation looks in the application DB for the
  table associated with the ingested model and returns the set of keywordized columns, but for some models (e.g.
  Actions) there is not a 1:1 relationship between a model and a table, so we need this multimethod to allow the
  model to override when necessary."
  ingested-model)

(defmethod ingested-model-columns :default
  ;; this works for most models - it just returns a set of keywordized column names from the database.
  [ingested]
  (->> ingested
       ->table-name
       fields-for-table
       keys
       (map (comp keyword u/lower-case-en))
       set))

(defn- drop-excess-keys
  "Given an ingested entity, removes keys that will not 'fit' into the current schema, because the column no longer
  exists. This can happen when serialization dumps generated on an earlier version of Metabase are loaded into a
  later version of Metabase, when a column gets removed. (At the time of writing I am seeing this happen with
  color on collections)."
  [ingested]
  (select-keys ingested (ingested-model-columns ingested)))

(defn load-xform-basics
  "Performs the usual steps for an incoming entity:
  - removes extraneous keys (e.g. `:serdes/meta`)

  You should call this as part of any implementation of [[load-xform]].

  This is a mirror (but not precise inverse) of [[extract-one-basics]]."
  [ingested]
  (drop-excess-keys ingested))

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
        pk       (first (t2/primary-keys model))
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

(defn- xform-by-spec [model-name ingested]
  (let [spec (make-spec model-name nil)]
    (when spec
      (-> (select-keys ingested (:copy spec))
          (into (for [[k transform] (:transform spec)
                      :when         (not (::nested transform))
                      :let          [res ((:import transform) (get ingested k))]
                      ;; do not try to insert nil values if transformer returns nothing
                      :when         res]
                  [k res]))))))

(defn- spec-nested! [model-name ingested instance]
  (binding [*current* instance]
    (let [spec (make-spec model-name nil)]
      (doseq [[k transform] (:transform spec)
              :when         (::nested transform)]
        ((:import transform) (get ingested k))))))

(defn default-load-one!
  "Default implementation of `load-one!`"
  [ingested maybe-local]
  (let [model-name (ingested-model ingested)
        adjusted   (or (xform-by-spec model-name ingested)
                       (load-xform ingested))
        instance (binding [mi/*deserializing?* true]
                   (if (nil? maybe-local)
                     (load-insert! model-name adjusted)
                     (load-update! model-name adjusted maybe-local)))]
    (spec-nested! model-name ingested instance)
    instance))

(defmethod load-one! :default [ingested maybe-local]
  (default-load-one! ingested maybe-local))

(defn entity-id?
  "Checks if the given string is a 21-character NanoID. Useful for telling entity IDs apart from identity hashes."
  [id-str]
  (boolean (and id-str
                (string? id-str)
                (re-matches #"^[A-Za-z0-9_-]{21}$" id-str))))

;; TODO: Clean up this [[identity-hash]] infrastructure once the `seed_entity_ids` issue is fixed. See above on the
;; details of the two hashing schemes.
(defn- find-by-identity-hash
  "Given a model and a target identity hash, this scans the appdb for any instance of the model corresponding to the
  hash. Does a complete scan, so this should be called sparingly!"
  ;; TODO This should be able to use a cache of identity-hash values from the start of the deserialization process.
  ;; Note that it needs to include either updates (or worst-case, invalidation) at [[load-one!]] time.
  [model id-hash]
  (->> (t2/reducible-select model)
       (into [] (comp (filter #(= id-hash (identity-hash %)))
                      (map t2.realize/realize)
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
  "Implements the most common structure for [[storage-path]] - `collections/c1/c2/c3/models/entityid_label.ext`"
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


;;; # Utilities for implementing serdes
;;; Note that many of these use `^::cache` to cache their lookups during deserialization. This greatly reduces the
;;; number of database lookups, since many entities might belong to eg. a single collection.

;;; ## General foreign keys

(defn ^:dynamic ^::cache *export-fk*
  "Given a numeric foreign key and its model (symbol, name or IModel), looks up the entity by ID and gets its entity ID
  or identity hash.
  Unusual parameter order means this can be used as `(update x :some_id export-fk 'SomeModel)`.

  NOTE: This works for both top-level and nested entities. Top-level entities like `Card` are returned as just a
  portable ID string.. Nested entities are returned as a vector of such ID strings."
  [id model]
  (when id
    (let [model-name (name model)
          entity     (t2/select-one model (first (t2/primary-keys model)) id)
          path       (when entity
                       (mapv :id (generate-path model-name entity)))]
      (cond
        (nil? entity)      (throw (ex-info "FK target not found" {:model model
                                                                  :id    id
                                                                  :skip  true}))
        (= (count path) 1) (first path)
        :else              path))))

(defn ^:dynamic ^::cache *import-fk*
  "Given an identifier, and the model it represents (symbol, name or IModel), looks up the corresponding
  entity and gets its primary key.

  The identifier can be a single entity ID string, a single identity-hash string, or a vector of entity ID and hash
  strings. If the ID is compound, then the last ID is the one that corresponds to the model. This allows for the
  compound IDs needed for nested entities like `DashboardCard`s to get their [[dependencies]].

  Throws if the corresponding entity cannot be found.

  Unusual parameter order means this can be used as `(update x :some_id import-fk 'SomeModel)`."
  [eid model]
  (when eid
    (let [eid    (if (vector? eid)
                   (last eid)
                   eid)
          entity (lookup-by-id model eid)]
      (if entity
        (get entity (first (t2/primary-keys model)))
        (throw (ex-info "Could not find foreign key target - bad serdes dependencies or other serialization error"
                        {:entity_id eid :model (name model)}))))))

(defn ^:dynamic ^::cache *export-fk-keyed*
  "Given a numeric ID, look up a different identifying field for that entity, and return it as a portable ID.
  Eg. `Database.name`.
  [[import-fk-keyed]] is the inverse.
  Unusual parameter order lets this be called as, for example, `(update x :db_id export-fk-keyed 'Database :name)`.

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

;;; ## Users
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

;;; ## Tables

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
  This is useful for writing [[dependencies]] implementations."
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

;;; ## Fields

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
  This is useful for writing [[dependencies]] implementations."
  [[db-name schema table-name field-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}
                  {:model "Field" :id field-name}]))

;;; ## MBQL Fields

(defn- mbql-entity-reference?
  "Is given form an MBQL entity reference?"
  [form]
  (mbql.normalize/is-clause? #{:field :field-id :fk-> :dimension :metric :segment} form))

(defn- mbql-id->fully-qualified-name
  [mbql]
  (-> mbql
      mbql.normalize/normalize-tokens
      (lib.util.match/replace
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
       [:metric (*export-fk* id 'Card)]

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
  (lib.util.match/replace entity
                  mbql-entity-reference?
                  (mbql-id->fully-qualified-name &match)

                  sequential?
                  (mapv ids->fully-qualified-names &match)

                  map?
                  (as-> &match entity
                    (m/update-existing entity :database (fn [db-id]
                                                          (if (= db-id lib.schema.id/saved-questions-virtual-database-id)
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
  (lib.util.match/replace entity
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
                                         lib.schema.id/saved-questions-virtual-database-id
                                         (t2/select-one-pk 'Database :name fully-qualified-name)))
                      mbql-fully-qualified-names->ids*) ; Process other keys

                  {:card-id (entity-id :guard portable-id?)}
                  (-> &match
                      (assoc :card-id (*import-fk* entity-id 'Card))
                      mbql-fully-qualified-names->ids*) ; Process other keys

                  [(:or :metric "metric") (fully-qualified-name :guard portable-id?)]
                  [:metric (*import-fk* fully-qualified-name 'LegacyMetric)]

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
    [:metric    (field :guard portable-id?)] #{[{:model "LegacyMetric" :id field}]}
    ["metric"   (field :guard portable-id?)] #{[{:model "LegacyMetric" :id field}]}
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
  raw IDs, return the corresponding set of serdes dependencies. The query can't be imported until all the referenced
  databases, tables and fields are loaded."
  [entity]
  (cond
    (map? entity)     (mbql-deps-map entity)
    (seqable? entity) (mbql-deps-vector entity)
    :else             (mbql-deps-vector [entity])))

;;; ## Dashboard/Question Parameters

(defn- export-parameter-mapping [mapping]
  (ids->fully-qualified-names mapping))

(defn export-parameter-mappings
  "Given the :parameter_mappings field of a `Card` or `DashboardCard`, as a vector of maps, converts
  it to a portable form with the field IDs replaced with `[db schema table field]` references."
  [mappings]
  (map export-parameter-mapping mappings))

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

;;; ## Viz settings

(def link-card-model->toucan-model
  "A map from model on linkcards to its corresponding toucan model.

  Link cards are dashcards that link to internal entities like Database/Dashboard/... or an url.

  It's here instead of [[metabase.models.dashboard-card]] to avoid cyclic deps."
  {"card"       :model/Card
   "dataset"    :model/Card
   "collection" :model/Collection
   "database"   :model/Database
   "dashboard"  :model/Dashboard
   "question"   :model/Card
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

(defn- json-ids->fully-qualified-names
  "Converts IDs to fully qualified names inside a JSON string.
  Returns a new JSON string with the IDs converted inside."
  [json-str]
  (-> json-str
      (json/parse-string true)
      ids->fully-qualified-names
      json/generate-string))

(defn- json-mbql-fully-qualified-names->ids
  "Converts fully qualified names to IDs in MBQL embedded inside a JSON string.
  Returns a new JSON string with teh IDs converted inside."
  [json-str]
  (-> json-str
      (json/parse-string true)
      mbql-fully-qualified-names->ids
      json/generate-string))

(defn- export-viz-click-behavior-link
  [{:keys [linkType type] :as click-behavior}]
  (cond-> click-behavior
    (= type "link") (update :targetId *export-fk* (link-card-model->toucan-model linkType))))

(defn- import-viz-click-behavior-link
  [{:keys [linkType type] :as click-behavior}]
  (cond-> click-behavior
    (= type "link") (update :targetId *import-fk* (link-card-model->toucan-model linkType))))

(defn- export-viz-click-behavior-mapping [mapping]
  (-> mapping
      (m/update-existing    :id                  json-ids->fully-qualified-names)
      (m/update-existing-in [:target :id]        json-ids->fully-qualified-names)
      (m/update-existing-in [:target :dimension] ids->fully-qualified-names)))

(defn- import-viz-click-behavior-mapping [mapping]
  (-> mapping
      (m/update-existing    :id                  json-mbql-fully-qualified-names->ids)
      (m/update-existing-in [:target :id]        json-mbql-fully-qualified-names->ids)
      (m/update-existing-in [:target :dimension] mbql-fully-qualified-names->ids)))

(defn- export-viz-click-behavior-mappings
  "The `:parameterMapping` on a `:click_behavior` viz settings is a map of... IDs turned into JSON strings which have
  been keywordized. Therefore the keys must be converted to strings, parsed, exported, and JSONified. The values are
  ported by [[export-viz-click-behavior-mapping]]."
  [mappings]
  (into {} (for [[kw-key mapping] mappings
                 ;; Mapping keyword shouldn't been a keyword in the first place, it's just how it's processed after
                 ;; being selected from db. In an ideal world we'd either have different data layout for
                 ;; click_behavior or not convert it's keys to a keywords. We need its full content here.
                 :let [k (u/qualified-name kw-key)]]
             (if (mb.viz/dimension-param-mapping? mapping)
               [(json-ids->fully-qualified-names k)
                (export-viz-click-behavior-mapping mapping)]
               [k mapping]))))

(defn- import-viz-click-behavior-mappings
  "The exported form of `:parameterMapping` on a `:click_behavior` viz settings is a map of JSON strings which contain
  fully qualified names. These must be parsed, imported, JSONified and then turned back into keywords, since that's the
  form used internally."
  [mappings]
  (into {} (for [[json-key mapping] mappings]
             (if (mb.viz/dimension-param-mapping? mapping)
               [(keyword (json-mbql-fully-qualified-names->ids json-key))
                (import-viz-click-behavior-mapping mapping)]
               [json-key mapping]))))

(defn- export-viz-click-behavior [settings]
  (some-> settings
          (m/update-existing    :click_behavior export-viz-click-behavior-link)
          (m/update-existing-in [:click_behavior :parameterMapping] export-viz-click-behavior-mappings)))

(defn- import-viz-click-behavior [settings]
  (some-> settings
          (m/update-existing    :click_behavior import-viz-click-behavior-link)
          (m/update-existing-in [:click_behavior :parameterMapping] import-viz-click-behavior-mappings)))

(defn- export-pivot-table [settings]
  (some-> settings
          (m/update-existing-in [:pivot_table.column_split :rows] ids->fully-qualified-names)
          (m/update-existing-in [:pivot_table.column_split :columns] ids->fully-qualified-names)))

(defn- import-pivot-table [settings]
  (some-> settings
          (m/update-existing-in [:pivot_table.column_split :rows] mbql-fully-qualified-names->ids)
          (m/update-existing-in [:pivot_table.column_split :columns] mbql-fully-qualified-names->ids)))

(defn- export-visualizations [entity]
  (lib.util.match/replace
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
    (-> settings
        (update-keys #(-> % json/parse-string export-visualizations json/generate-string))
        (update-vals export-viz-click-behavior))))

(defn export-visualization-settings
  "Given the `:visualization_settings` map, convert all its field-ids to portable `[db schema table field]` form."
  [settings]
  (when settings
    (-> settings
        export-visualizations
        export-viz-link-card
        export-viz-click-behavior
        export-pivot-table
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
  (lib.util.match/replace
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
    (-> settings
        (update-keys #(-> % name json/parse-string import-visualizations json/generate-string))
        (update-vals import-viz-click-behavior))))

(defn import-visualization-settings
  "Given an EDN value as exported by [[export-visualization-settings]], convert its portable `[db schema table field]`
  references into Field IDs."
  [settings]
  (when settings
    (-> settings
        import-visualizations
        import-viz-link-card
        import-viz-click-behavior
        import-pivot-table
        (update :column_settings import-column-settings))))

(defn- viz-link-card-deps
  [settings]
  (when-let [{:keys [model id]} (get-in settings [:link :entity])]
    #{(case model
        "table" (table->path id)
        [{:model (name (link-card-model->toucan-model model))
          :id    id}])}))

(defn- viz-click-behavior-deps
  [settings]
  (when-let [{:keys [linkType targetId type]} (:click_behavior settings)]
    (case type
      "link" (when-let [model (some-> linkType link-card-model->toucan-model name)]
               #{[{:model model
                   :id    targetId}]})
      ;; TODO: We might need to handle the click behavior that updates dashboard filters? I can't figure out how get
      ;; that to actually attach to a filter to check what it looks like.
      nil)))

(defn visualization-settings-deps
  "Given the :visualization_settings (possibly nil) for an entity, return any embedded serdes-deps as a set.
  Always returns an empty set even if the input is nil."
  [viz]
  (let [column-settings-keys-deps (some->> viz
                                           :column_settings
                                           keys
                                           (map (comp mbql-deps json/parse-string name)))
        column-settings-vals-deps (some->> viz
                                           :column_settings
                                           vals
                                           (map viz-click-behavior-deps))
        link-card-deps            (viz-link-card-deps viz)
        click-behavior-deps       (viz-click-behavior-deps viz)]
    (->> (concat column-settings-keys-deps
                 column-settings-vals-deps
                 [(mbql-deps viz) link-card-deps click-behavior-deps])
         (filter some?)
         (reduce set/union #{}))))

(defn- viz-click-behavior-descendants [{:keys [click_behavior]}]
  (when-let [{:keys [linkType targetId type]} click_behavior]
    (case type
      "link" (when-let [model (link-card-model->toucan-model linkType)]
               #{[(name model) targetId]})
      ;; TODO: We might need to handle the click behavior that updates dashboard filters? I can't figure out how get
      ;; that to actually attach to a filter to check what it looks like.
      nil)))

(defn- viz-column-settings-descendants [{:keys [column_settings]}]
  (when column_settings
    (->> (vals column_settings)
         (mapcat viz-click-behavior-descendants)
         set)))

(defn visualization-settings-descendants
  "Given the :visualization_settings (possibly nil) for an entity, return anything that should be considered a
  descendant. Always returns an empty set even if the input is nil."
  [viz]
  (set/union (viz-click-behavior-descendants  viz)
             (viz-column-settings-descendants viz)))

;;; Common transformers

(defn fk "Export Foreign Key" [model & [field-name]]
  (cond
    ;; this `::fk` is used in tests to determine that foreign keys are handled
    (= model :model/User)  {::fk true :export *export-user* :import *import-user*}
    (= model :model/Table) {::fk true :export *export-table-fk* :import *import-table-fk*}
    (= model :model/Field) {::fk true :export *export-field-fk* :import *import-field-fk*}
    field-name             {::fk    true
                            :export #(*export-fk-keyed* % model field-name)
                            :import #(*import-fk-keyed* % model field-name)}
    :else                  {::fk true :export #(*export-fk* % model) :import #(*import-fk* % model)}))

(defn nested "Nested entities" [model backward-fk opts]
  (let [model-name (name model)
        sorter     (:sort-by opts :created_at)
        key-field  (:key-field opts :entity_id)]
    {::nested     true
     :model       model
     :backward-fk backward-fk
     :export      (fn [data]
                    (assert (every? #(t2/instance-of? model %) data)
                            (format "Nested data is expected to be a %s, not %s" model (t2/model (first data))))
                    ;; `nil? data` check is for `extract-one` case in tests; make sure to add empty vectors in
                    ;; `extract-query` implementations for nested collections
                    (try
                      (->> (or data (when (nil? data)
                                      (t2/select model backward-fk (:id *current*))))
                           (sort-by sorter)
                           (mapv #(extract-one model-name opts %)))
                      (catch Exception e
                        (throw (ex-info (format "Error exporting nested %s" model)
                                        {:model     model
                                         :parent-id (:id *current*)}
                                        e)))))
     :import      (fn [lst]
                    (let [parent-id (:id *current*)
                          first-eid (some->> (first lst)
                                             (entity-id model-name))
                          enrich    (fn [ingested]
                                      (-> ingested
                                          (assoc backward-fk parent-id)
                                          (update :serdes/meta #(or % [{:model model-name :id (get ingested key-field)}]))))]
                      (cond
                        (nil? first-eid) ; no entity id, just drop existing stuff
                        (do (t2/delete! model backward-fk parent-id)
                            (doseq [ingested lst]
                              (load-one! (enrich ingested) nil)))

                        (entity-id? first-eid) ; proper entity id, match by them
                        (do (t2/delete! model backward-fk parent-id :entity_id [:not-in (map :entity_id lst)])
                            (doseq [ingested lst
                                    :let     [ingested (enrich ingested)
                                              local    (lookup-by-id model (entity-id model-name ingested))]]
                              (load-one! ingested local)))

                        :else           ; identity hash
                        (let [incoming  (set (map #(entity-id model-name %) lst))
                              local     (->> (t2/reducible-select model backward-fk parent-id)
                                             (into [] (map t2.realize/realize))
                                             (m/index-by identity-hash))
                              to-delete (into [] (comp (filter #(contains? incoming (key %)))
                                                       (map #(:id (val %))))
                                              local)]
                          (t2/delete! model :id [:in (map :id to-delete)])
                          (doseq [ingested lst]
                            (load-one! (enrich ingested) (get local (entity-id model-name ingested))))))))}))

(defn parent-ref "Transformer for parent id for nested entities" []
  {::fk true :export (constantly nil) :import identity})

(defn date "Transformer to parse the dates" []
  {:export identity :import #(if (string? %) (u.date/parse %) %)})

;;; ## Memoizing appdb lookups

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
