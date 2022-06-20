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
;;;     - For each entity in that stream, it calls `(extract-one entity)`, which converts the Toucan entity
;;;       to a vanilla Clojure map with `:serdes/meta` on it.
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

  Returns the result of `db/select-reducible`, or a similar reducible stream of Toucan entities.

  Defaults to a straight `(db/select-reducible model)` for the entire table.
  You may want to override this to eg. skip archived entities, or otherwise filter what gets serialized."
  (fn [model _] model))

(defmulti extract-one
  "Extracts a single Toucan entity into a vanilla Clojure map with `:serdes/meta` attached.

  The default implementation uses the model name as the `:type` and either `:entity_id` or [[serdes.hash/identity-hash]]
  as the `:id`. It also strips off the database's numeric `:id`.

  That suffices for a few simple entities, but most entities will need to override this.
  They should follow the pattern of:
  - Convert to a vanilla Clojure map, not a [[models/IModel]] instance.
  - Drop the numeric database primary key
  - Replace any foreign keys with portable values (eg. entity IDs or `identity-hash`es, owning user's ID with their
    email, etc.)
  - Consider attaching a human-friendly `:label` under `:serdes/meta`. (Eg. a Collection's `:slug`)

  When overriding this, [[extract-one-basics]] is probably a useful starting point.

  Keyed by the model name of the entity."
  name)

(defmethod extract-all :default [model opts]
  (eduction (map extract-one) (extract-query model opts)))

(defmethod extract-query :default [model _]
  (db/select-reducible model))

(defn extract-one-basics
  "A helper for writing [[extract-one]] implementations. It takes care of the basics:
  - Convert to a vanilla Clojure map.
  - Add `:serdes/meta`.
  - Drop the primary key.

  Returns the Clojure map."
  [entity]
  (-> (into {} entity)
      (assoc :serdes/meta {:type (name entity)
                           :id   (or (:entity_id entity) (serdes.hash/identity-hash entity))})
      (dissoc (models/primary-key entity))))

(defmethod extract-one :default [entity]
  (extract-one-basics entity))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Deserialization Process                                                |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; Deserialization is split into two stages, mirroring serialization. They are called ingestion and merging.
;;; Ingestion turns whatever serialized form (eg. a tree of YAML files) was produced by storage into Clojure maps with
;;; `:serdes/meta` maps. Merging imports those entities into the appdb, updating and inserting rows as needed.
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
;;; Merging:
;;; Merging tries to find corresponding entities in the destination appdb by `entity_id` or `identity-hash`, and update
;;; those rows rather than duplicating.
;;; The entry point is [[metabase-enterprise.serialization.v2.merge/merge-metabase]]. The top-level process works like
;;; this:
;;; - `(merge-prescan-all "ModelName")` is called, which selects the entire collection as a reducible stream and calls
;;;   [[merge-prescan-one]] on each entry.
;;;     - The default for that usually is the right thing.
;;; - `(merge-prescan-one entity)` turns a particular entity into an `[entity_id identity-hash primary-key]` triple.
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
;;;     - Then it calls `(merge-one! ingested maybe-local-entity)`, passing the `ingested` value and either `nil` or the
;;;       Toucan entity corresponding to the incoming map.
;;;     - `merge-one!` is a side-effecting black box to the rest of the deserialization process.
;;;       It returns the primary key of the new or existing entity, which is necessary to resolve foreign keys between
;;;       imported entities.
;;;     - The table of "local" entities found by the prescan is updated to include newly merged ones.
;;;
;;;
;;; `merge-one!` has a default implementation that works for most models:
;;; - Call `(merge-xform ingested)` to massage the map as needed.
;;;     - This is the spot to override, for example to convert a foreign key from portable entity ID into a database ID.
;;; - Then, call either:
;;;     - `(merge-upsert! ingested local-entity)` if the local entity exists, or
;;;     - `(merge-insert! ingested)` if the entity is new.
;;;   Both of these have the obvious defaults of [[toucan.db/update!]] or [[toucan.db/simple-insert!]].

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            :serdes/meta maps                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+
;;; The Clojure maps from extraction and ingestion always include a special key `:serdes/meta` giving some information
;;; about the serialized entity. The value is always a map like:
;;; `{:type "ModelName" :id "entity ID or identity hash string" :label "Human-readable name"}`
;;; `:type` and `:id` are required; `:label` is optional.
;;;
;;; Many of the multimethods are keyed on the `:type` field.

(defmulti merge-prescan-all
  "Returns a reducible stream of `[entity_id identity-hash primary-key]` triples for the entire table.

  Defaults to running [[merge-prescan-one]] over each entity returned by [[db/select-reducible]] for this model.
  Override this method if filtering is needed.

  Keyed on the model name."
  identity)

(defmulti merge-prescan-one
  "Converts a Toucan entity into a `[entity_id identity-hash primary-key]` triple for the deserialization machinery.

  Defaults to using a literal `:entity_id` column. For models with a different entity ID (eg. a Table's name, a
  Setting's key), override this method.

  Keyed on the model name."
  name)

(defmethod merge-prescan-all :default [model]
  (eduction (map merge-prescan-one) (db/select-reducible (symbol model))))

(defmethod merge-prescan-one :default [entity]
  [(:entity_id entity)
   (serdes.hash/identity-hash entity)
   (get entity (models/primary-key entity))])

(defn- ingested-type
  "The dispatch function for several of the merge multimethods: dispatching on the type of the incoming entity."
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

(defmulti merge-xform
  "Given the incoming vanilla map as ingested, transform it so it's suitable for sending to the database (in eg.
  [[db/simple-insert!]]).
  For example, this should convert any foreign keys back from a portable entity ID or identity hash into a numeric
  database ID. This is the mirror of [[extract-one]], in spirit. (They're not strictly inverses - [[extract-one]] drops
  the primary key but this need not put one back, for example.)

  By default, this just calls [[merge-xform-basics]].
  If you override this, call [[merge-xform-basics]] as well."
  ingested-type)

(defn merge-xform-basics
  "Performs the usual steps for an incoming entity:
  - Drop :serdes/meta

  You should call this as a first step from any implementation of [[merge-xform]].

  This is a mirror (but not precise inverse) of [[extract-one-basics]]."
  [ingested]
  (dissoc ingested :serdes/meta))

(defmethod merge-xform :default [ingested]
  (merge-xform-basics ingested))

(defmulti merge-upsert!
  "Called by the default [[merge-one!]] if there is a corresponding entity already in the appdb.
  The first argument is the model name, the second the incoming map we're deserializing, and the third is the Toucan
  entity found in the appdb.

  Defaults to a straightforward [[db/update!]], and you may not need to update it.

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the primary key of the updated entity."
  (fn [model _ _] model))

(defmethod merge-upsert! :default [model ingested local]
  (let [pk (get local (models/primary-key local))]
    (log/tracef "Upserting %s %d: old %s new %s" model pk (pr-str local) (pr-str ingested))
    (db/update! (symbol model) pk ingested)
    pk))

(defmulti merge-insert!
  "Called by the default [[merge-one!]] if there is no corresponding entity already in the appdb.

  Defaults to a straightforward [[db/simple-insert!]], and you probably don't need to implement this.
  Note that [[db/insert!]] should be avoided - we don't want to populate the `:entity_id` field if it wasn't already
  set!

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the primary key of the newly inserted entity."
  (fn [model _] model))

(defmethod merge-insert! :default [model ingested]
  (log/tracef "Inserting %s: %s" model (pr-str ingested))
  (db/simple-insert! (symbol model) ingested))

(defmulti merge-one!
  "Black box for integrating a deserialized entity into this appdb.
  `(merge-one! ingested maybe-local)`

  `ingested` is the vanilla map from ingestion, with the `:serdes/meta` key on it.
  `maybe-local` is either `nil`, or the corresponding Toucan entity from the appdb.

  Defaults to calling [[merge-xform]] to massage the incoming map, then either [[merge-upsert!]] if `maybe-local`
  exists, or [[merge-insert!]] if it's `nil`.

  Prefer overriding [[merge-xform]], and if necessary [[merge-upsert!]] and [[merge-insert!]], rather than this.

  Keyed on the model name.

  Returns the primary key of the updated or inserted entity."
  (fn [ingested _]
    (ingested-type ingested)))

(defmethod merge-one! :default [ingested maybe-local-id]
  (let [model    (ingested-type ingested)
        pkey     (models/primary-key (db/resolve-model (symbol model)))
        adjusted (merge-xform ingested)]
    (if (nil? maybe-local-id)
      (merge-insert! model adjusted)
      (merge-upsert! model adjusted (db/select-one (symbol model) pkey maybe-local-id)))))

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
  This is useful when writing [[merge-xform]] to turn a foreign key from a portable form to an appdb ID."
  [model id-str]
  (if (entity-id? id-str)
    (db/select-one model :entity_id id-str)
    (find-by-identity-hash model id-str)))
