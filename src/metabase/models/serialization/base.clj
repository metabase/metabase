(ns metabase.models.serialization.base
  "Defines several helper functions and multimethods for the serialization system.
  Serialization is an enterprise feature, but in the interest of keeping all the code for an entity in one place, these
  methods are defined here and implemented for all the exported models.

  Whether to export a new model:
  - Generally, the high-profile user facing things (databases, questions, dashboards, snippets, etc.) are exported.
  - Internal or automatic things (users, activity logs, permissions) are not.

  If the model is not exported, add it to the exclusion lists in the tests. Every model should be explicitly listed as
  exported or not, and a test enforces this so serialization isn't forgotten for new models."
  (:require [clojure.tools.logging :as log]
            [metabase.models.serialization.hash :as serdes.hash]
            [toucan.db :as db]
            [toucan.models :as models]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Serialization Process                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; Serialization happens in two stages: extraction and storage. These are independent and deliberately decoupled.
;;; The result of extraction is a reducible stream of Clojure maps with `:serdes/meta` keys on them (see below).
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

(defmulti extract-all
  "Entry point for extracting all entities of a particular model:
  `(extract-all \"ModelName\" {opts...})`
  Keyed on the model name.

  Returns a reducible stream of extracted maps (ie. vanilla Clojure maps with `:serdes/meta` keys).

  You probably don't want to implement this directly. The default implementation delegates to [[extract-query]] and
  [[extract-one]], which are usually more convenient to override."
  (fn [model _] model))

(defmulti extract-query
  "Performs the select query, possibly filtered, for all the entities of this type that should be serialized. Called
  from [[extract-all]]'s default implementation.

  `(extract-query \"ModelName\" opts)`

  Keyed on the model name, the first argument.

  Returns a reducible stream of maps with `:serdes/meta` keys on them. It should *not* be a stream of Toucan entities,
  but vanilla Clojure maps.

  In fact, Toucan's high-level niceties (eg. expanding JSON-encoded fields to Clojure data, decrypting, type
  conversions, or hydrating some relationship by default) are counterproductive when our goal is a database-level
  export. As a specific example, [[db/simple-select]] expands JSON but [[db/simple-insert!]] doesn't put it back.
  There's also no `simple-update!`, making a fresh insert diverge from an update.

  Defaults to using the helper `(raw-reducible-query model)` for the entire table, which is equivalent to
  `(db/simple-select-reducible model)` but without running post-select handlers. This returns vanilla maps, not
  [[db/IModel]] instances.

  You may want to override this to eg. skip archived entities, or otherwise filter what gets serialized. Prefer using
  the two-argument form of [[raw-reducible-query]]."
  (fn [model _] model))

(defmulti extract-one
  "Extracts a single entity retrieved from the database into a portable map with `:serdes/meta` attached.

  The default implementation uses the model name as the `:type` and either `:entity_id` or [[serdes.hash/identity-hash]]
  as the `:id`. It also strips off the database's numeric primary key.

  That suffices for a few simple entities, but most entities will need to override this.
  They should follow the pattern of:
  - Convert to a vanilla Clojure map, not a [[models/IModel]] instance.
  - Drop the numeric database primary key
  - Replace any foreign keys with portable values (eg. entity IDs or `identity-hash`es, owning user's ID with their
    email, etc.)
  - Consider attaching a human-friendly `:label` under `:serdes/meta`. (Eg. a Collection's `:slug`)

  When overriding this, [[extract-one-basics]] is probably a useful starting point.

  Keyed by the model name of the entity, the first argument."
  (fn [model _] model))

(defmethod extract-all :default [model opts]
  (eduction (map (partial extract-one model))
            (extract-query model opts)))

(defn raw-reducible-query
  "Helper for calling Toucan's raw [[db/reducible-query]]. With just the model name, fetches everything. You can filter
  with a HoneySQL map like {:where [:= :archived true]}.

  Returns a reducible stream of JDBC row maps."
  ([model-name]
   (raw-reducible-query model-name nil))
  ([model-name honeysql-form]
   (db/reducible-query (merge {:select [:*] :from [(symbol model-name)]}
                              honeysql-form))))

(defmethod extract-query :default [model-name _]
  (raw-reducible-query model-name))

(defn extract-one-basics
  "A helper for writing [[extract-one]] implementations. It takes care of the basics:
  - Convert to a vanilla Clojure map.
  - Add `:serdes/meta`.
  - Drop the primary key.

  Returns the Clojure map."
  [model-name entity]
  (let [model (db/resolve-model (symbol model-name))
        pk    (models/primary-key model)]
    (-> entity
        (assoc :serdes/meta {:type model-name
                             :id   (or (:entity_id entity)
                                       (serdes.hash/identity-hash (model (get entity pk))))})
        (dissoc pk))))

(defmethod extract-one :default [model-name entity]
  (extract-one-basics model-name entity))

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
;;; - `(ingest-list ingestable)` returns a reducible stream of `:serdes/meta` maps in any order.
;;; - `(ingest-one ingestable meta-map)` ingests a single entity into memory, returning it as a map.
;;;
;;; This two-stage design avoids needing all the data in memory at once, where that's practical with the underlying
;;; some storage media (eg. files).
;;;
;;; Loading:
;;; Loading tries to find corresponding entities in the destination appdb by `entity_id` or `identity-hash`, and update
;;; those rows rather than duplicating.
;;; The entry point is [[metabase-enterprise.serialization.v2.load/load-metabase]]. The top-level process works like
;;; this:
;;; - `(load-prescan-all "ModelName")` is called, which selects the entire collection as a reducible stream and calls
;;;   [[load-prescan-one]] on each entry.
;;;     - The default for that usually is the right thing.
;;; - `(load-prescan-one entity)` turns a particular entity into an `[entity_id identity-hash primary-key]` triple.
;;;     - The default will work for models with a literal `entity_id` field; those with alternative IDs (database,
;;;       table, field, setting, etc.) should override this method.
;;; - Prescanning complete, `(ingest-list ingestable)` gets the metadata for every exported entity in arbitrary order.
;;;     - `(ingest-one meta-map opts)` is called on each first to ingest the value into memory, then
;;;     - `(serdes-dependencies ingested)` to get a list of other IDs (entity IDs or identity hashes).
;;;         - The default is an empty list.
;;;     - The idea of dependencies is eg. a database must be loaded before its tables, a table before its fields, a
;;;       collection's ancestors before the collection itself.
;;;     - Dependencies are loaded recursively in postorder; circular dependencies cause the process to throw.
;;; - Having found an entity it can really load, the core code will check its table of IDs found by prescanning.
;;;     - Then it calls `(load-one! ingested maybe-local-entity)`, passing the `ingested` value and either `nil` or the
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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            :serdes/meta maps                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; The Clojure maps from extraction and ingestion always include a special key `:serdes/meta` giving some information
;;; about the serialized entity. The value is always a map like:
;;; `{:type "ModelName" :id "entity ID or identity hash string" :label "Human-readable name"}`
;;; `:type` and `:id` are required; `:label` is optional.
;;;
;;; Many of the multimethods are keyed on the `:type` field.

(defmulti load-prescan-all
  "Returns a reducible stream of `[entity_id identity-hash primary-key]` triples for the entire table.

  Defaults to running [[load-prescan-one]] over each entity returned by [[jdbc/reducible-query]] for this model.
  Override this method if filtering is needed.

  Keyed on the model name."
  identity)

(defmulti load-prescan-one
  "Converts a database entity into a `[entity_id identity-hash primary-key]` triple for the deserialization machinery.
  Called with the Toucan model (*not* this entity), and the JDBC map for the entity in question.

  Defaults to using a literal `:entity_id` column. For models with a different entity ID (eg. a Table's name, a
  Setting's key), override this method.

  Keyed on the model name."
  (fn [model _] (name model)))

(defmethod load-prescan-all :default [model-name]
  (let [model (db/resolve-model (symbol model-name))]
    (eduction (map (partial load-prescan-one model))
              (raw-reducible-query model-name))))

(defmethod load-prescan-one :default [model entity]
  (let [pk  (models/primary-key model)
        key (get entity pk)]
    [(:entity_id entity)
     (serdes.hash/identity-hash (db/select-one model pk key)) ; TODO This sucks for identity-hash!
     key]))

(defn- ingested-type
  "The dispatch function for several of the load multimethods: dispatching on the type of the incoming entity."
  [ingested]
  (-> ingested :serdes/meta :type))

(defmulti serdes-dependencies
  "Given an entity map as ingested (not a Toucan entity) returns a (possibly empty) list of its dependencies, where each
  dependency is represented by either the entity ID or identity hash of the target entity.

  Keyed on the model name.
  Default implementation returns an empty vector, so only models that have dependencies need to implement this."
  ingested-type)

(defmethod serdes-dependencies :default [_]
  [])

(defmulti load-xform
  "Given the incoming vanilla map as ingested, transform it so it's suitable for sending to the database (in eg.
  [[db/simple-insert!]]).
  For example, this should convert any foreign keys back from a portable entity ID or identity hash into a numeric
  database ID. This is the mirror of [[extract-one]], in spirit. (They're not strictly inverses - [[extract-one]] drops
  the primary key but this need not put one back, for example.)

  By default, this just calls [[load-xform-basics]].
  If you override this, call [[load-xform-basics]] as well."
  ingested-type)

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
  The first argument is the model name, the second the incoming map we're deserializing, and the third is the Toucan
  entity found in the appdb.

  Defaults to a straightforward [[db/update!]], and you may not need to update it.

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the primary key of the updated entity."
  (fn [model _ _] model))

(defmethod load-update! :default [model-name ingested local]
  (let [model (db/resolve-model (symbol model-name))
        pk    (models/primary-key model)
        id    (get local pk)
        ; Get a WHERE clause, but then strip off the WHERE part to include it in the JDBC call below.
        ;where (update (db/honeysql->sql {:where [:= pk id]}) 0
        ;              #(.substring 5))
        ]
    (log/tracef "Upserting %s %d: old %s new %s" model-name id (pr-str local) (pr-str ingested))
    ; Using the two-argument form of [[db/update!]] that takes the model and a HoneySQL form for the actual update.
    (db/update! (symbol model-name) {:where [:= pk id] :set ingested})
    pk))

(defmulti load-insert!
  "Called by the default [[load-one!]] if there is no corresponding entity already in the appdb.

  Defaults to a straightforward [[db/simple-insert!]], and you probably don't need to implement this.
  Note that [[db/insert!]] should be avoided - we don't want to populate the `:entity_id` field if it wasn't already
  set!

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the primary key of the newly inserted entity."
  (fn [model _] model))

(defmethod load-insert! :default [model ingested]
  (log/tracef "Inserting %s: %s" model (pr-str ingested))
  ; Toucan's simple-insert! actually does the right thing for our purposes: it doesn't call pre-insert or post-insert.
  (db/simple-insert! (symbol model) ingested))

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
    (ingested-type ingested)))

(defmethod load-one! :default [ingested maybe-local-id]
  (let [model    (ingested-type ingested)
        pkey     (models/primary-key (db/resolve-model (symbol model)))
        adjusted (load-xform ingested)]
    (if (nil? maybe-local-id)
      (load-insert! model adjusted)
      (load-update! model adjusted (db/select-one (symbol model) pkey maybe-local-id)))))

(defn entity-id?
  "Checks if the given string is a 21-character NanoID. Useful for telling entity IDs apart from identity hashes."
  [id-str]
  (boolean (re-matches #"^[A-Za-z0-9_-]{21}$" id-str)))

(defn- find-by-identity-hash
  "Given a model and a target identity hash, this scans the appdb for any instance of the model corresponding to the
  hash. Does a complete scan, so this should be called sparingly!"
  ;; TODO This should be able to use a cache of identity-hash values from the start of the deserialization process.
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
