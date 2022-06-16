(ns metabase.models.serialization.base
  "Defines several helper functions and protocols for the serialization system.
  Serialization is an enterprise feature, but in the interest of keeping all the code for an entity in one place, these
  methods are defined here and implemented for all the exported models.

  Whether to export a new model:
  - Generally, the high-profile user facing things (databases, questions, dashboards, snippets, etc.) are exported.
  - Internal or automatic things (users, activity logs, permissions) are not.

  If the model is not exported, add it to the exclusion lists in the tests."
  (:require [metabase.models.serialization.hash :as serdes.hash]
            [potemkin.types :as p.types]
            [toucan.db :as db]
            [toucan.models :as models])
  (:import [java.io File]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Serialization Process                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; The end result of serialization is a directory tree of YAML files. Some entities are written to individual files
;;; (most of them, eg. collections and fields) while others are consolidated into a single file for the entire set (eg.
;;; settings).
;;;
;;; Some entities cannot be loaded until others are also loaded, these are its *dependencies*. For example, a Field
;;; can't be loaded until its Table is defined, and the Table can't be loaded without the Database. These dependencies
;;; are derived from the serialized form, and then loaded recursively in postorder.
(defmulti serdes-dependencies
  "Given an entity map AS DECODED FROM YAML, returns a (possibly empty) list of its dependencies, where each dependency
  is represented by `(or entity_id identity-hash)` of the target entity.

  This is mostly part of the deserialization process, so it's based on the serialized map and not on an IModel instance.

  Default implementation returns an empty vector, so only models that have dependencies need to implement this."
  :serdes_type)

(defmethod serdes-dependencies :default [_]
  [])

(p.types/defprotocol+ ISerializable
  ;;; Serialization side
  (serialize-all
    [this user-or-nil]
    "Serializes all relevant instances of this model.
    The return value is a reducible sequence of [file-path entity-map] pairs, possibly empty.
    There can be a single file for all the entities (eg. settings) or one file per entity.

    The default implementation assumes there will be many files:
    - It calls (serialize-query this user-or-nil) to get the (lazy, reducible) set of entities to serialize.
    - For each entity, it calls `(serialize-one e)` and expects a `[file-path {...}]` pair.
    - These pairs are returned as a reducible stream.

    To serialize as a single file, override this to do something else. (Then `serialize-query` and `serialize-one` are
    never called and can be stubs.)")

  (serialize-query
    [this user-or-nil]
    "Performs the select query, possibly filtered, for all the entities of this type that should be serialized.
    Returns the result of the db/select-reducible.
    Defaults to a naive `db/select-reducible` for the entire model, ignoring the optional user argument.

    Only called by `serialize-all`, either the default implementation or (optionally) by a custom one.
    This exists to be an easy override point, when the default `serialize-all` is good but you need to filter
    the returned set, eg. by dropping archived entities.")

  (serialize-one
    [this]
    "Serializes a single entity into a YAML-friendly map, with its filename.
    Returns a [file-name {entity map...}] pair.

    Default implementation:
    - Uses `\"$ENTITY_ID.yaml\"` or `\"$IDENTITY_HASH.yaml\"` as the filename.
    - Returns the entity as a vanilla map with `:id` and any `:foo_at` fields removed.
    - Adds the field `:type \"Collection\"` (etc.) to specify the model.

    That suffices for a few simple entities, but most entities will need to override this.
    They should follow the pattern of dropping timestamps and numeric database IDs, and including the `:type`.")

  ;;; Deserialization side.
  (deserialize-file
    [this new-map local]
    "Given the model, the file contents as an EDN map, and any corresponding entity already existing in the database,
    this performs whatever steps are necessary to update or insert the incoming entity.
    Called for each **file**, which usually means for each entity. For single-file output like for settings, this is
    called once for the whole file.
    Defaults to [[deserialize-file-plus]] with [[identity]] as the inner transformation.")

  (deserialize-upsert
    [old-entity new-map]
    "Given the original entity and the new deserialized map (not an IModel yet), upsert appdb to merge in the updated
    entity.
    Defaults to a naive update by primary key, using just the new map's values.")

  (deserialize-insert
    [this new-map]
    "Given the model (eg. Collection) and the new deserialized map (not an IModel), insert this new record into
    the appdb.
    Defaults to a straight db/insert! of this new map."))

(defn- default-serialize-all [model user-or-nil]
  (eduction (map serialize-one) (serialize-query model user-or-nil)))

(defn- default-query [model _]
  (db/select-reducible model))

(defn serialize-one-plus
  "Helper for applying the usual serialization steps to a single entity, followed by a user-supplied function with any
  specific logic the entity needs."
  [transform named]
  (fn [entity]
    [(format "%s%s%s%s.yaml"
             (name entity)
             File/separatorChar
             (or (:entity_id entity)
                 (serdes.hash/identity-hash entity))
             (when named
               (str "+" (named entity))))
     (-> (into {} entity)
         (dissoc (models/primary-key entity))
         (assoc :serdes_type (name entity))
         transform)]))

(defn- default-upsert [old-entity new-map]
  (db/update! (symbol (name old-entity)) (get old-entity (models/primary-key old-entity)) new-map)
  #_(prn "upsert" old-entity new-map))

(defn- default-insert [model new-map]
  (db/simple-insert! model new-map)
  #_(prn "insert" new-map))

(defn deserialize-file-plus
  "Given a function, this returns a function suitable for use as [[deserialize-file]]. The provided function is applied
  to the EDN map read from the YAML file, and then either [[deserialize-upsert]] or [[deserialize-insert]] is called
  depending on whether a corresponding entity was found in the database."
  [f]
  (fn [model contents local]
    (let [hydrated (f contents)]
      (if local
        (deserialize-upsert (db/select-one model :id local) hydrated)
        (deserialize-insert model hydrated)))))

(def ISerializableDefaults
  "Default implementations for [[ISerializable]], so models need only override those that need special handling."
  {:serialize-all         default-serialize-all
   :serialize-query       default-query
   :serialize-one         (serialize-one-plus identity nil)
   :deserialize-file      (deserialize-file-plus identity)
   :deserialize-upsert    default-upsert
   :deserialize-insert    default-insert})

(defn entity-id?
  "Checks if the given string is a 21-character NanoID."
  [id-str]
  (boolean (re-matches #"^[A-Za-z0-9_-]{21}$" id-str)))

(defn find-by-identity-hash
  "Given a model and a target identity hash, this scans the appdb for any instance of the model corresponding to the
  hash. Does a complete scan, so this should be called sparingly!"
  ;; TODO This should be able to use a cache of identity-hash values from the start of the deserialization process.
  [model id-hash]
  (->> (db/select-reducible model)
       (into [] (comp (filter #(= id-hash (serdes.hash/identity-hash %)))
                      (take 1)))
       first))

(defn lookup-by-id
  "Given an ID string, this endeavours to find the matching entity, whether it's an entity_id or identity hash."
  [model id-str]
  (if (entity-id? id-str)
    (db/select-one model :entity_id id-str)
    (find-by-identity-hash model id-str)))
