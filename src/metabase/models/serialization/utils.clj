(ns metabase.models.serialization.utils
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

;;; Utilities for writing serialization functions.
(defn remove-timestamps
  "Removes any key that ends with _at."
  [m]
  (let [ats (filter #(.endsWith (str %) "_at") (keys m))]
    (apply dissoc m ats)))

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
  ;(serdes-combined-file?
  ;  [this]
  ;  "Given a model, returns true if it should be dumped as a single file (eg. Settings) or false to dump as one file per
  ;  entity (the majority).
  ;  Default implementation returns false, to dump as one file per entity.")

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
  [f]
  (fn [entity]
    [(format "%s%s%s.yaml" (name entity) File/separatorChar (or (:entity_id entity) (serdes.hash/identity-hash entity)))
     (-> (into {} entity)
         (dissoc (models/primary-key entity))
         ;(remove-timestamps)
         (assoc :serdes_type (name entity))
         f)]))

(defn- default-upsert [old-entity new-map]
  #_(db/update! old-entity (get old-entity (models/primary-key old-entity)) new-map)
  (prn "upsert" old-entity new-map))

(defn- default-insert [_model new-map]
  #_(db/simple-insert! model new-map)
  (prn "insert" new-map))

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
   :serialize-one         (serialize-one-plus identity)
   :deserialize-file      (deserialize-file-plus identity)
   :deserialize-upsert    default-upsert
   :deserialize-insert    default-insert})

;;; Serialization machinery
;;; TODO To be moved to the enterprise tree, since serialization is an enterprise feature.

(def ^:private exported-models
  ['Collection
   'Setting])

(defn serialize-metabase
  "Serializes the complete database into a reducible stream of [file-path edn-map] pairs.
  This is the last step before conversion to YAML and writing to disk, and a useful point for testing.
  The file paths are relative to the root dump directory."
  [user-or-nil]
  (eduction cat (for [model exported-models]
                   (serialize-all (db/resolve-model model) user-or-nil))))

;; The deserialization source is a two-arity function: (src) returns a list of all file names, (src path) returns the
;; contents of that file, converted to EDN.
;; Therefore an in-memory source can just wrap a {path EDN-contents} map.
(defn- deserialization-source-memory [files]
  (let [mapped (into {} files)]
    (fn
      ([] (keys mapped))
      ([path] (or (get mapped path)
                  (throw (ex-info (format "Unknown serialized file %s" path) {:path path :tree mapped})))))))

(defn- scan-ids [{:keys [entity_id] :as entity}]
  (let [pk (get entity (models/primary-key entity))]
    (cond-> {:by-identity-hash {(serdes.hash/identity-hash entity) pk}}
      entity_id (assoc :by-entity-id {entity_id pk}))))

(defn- deserialization-prescan-model [model]
  (transduce (map scan-ids) (partial merge-with merge) {:by-entity-id {} :by-identity-hash {}}
             (db/select-reducible model)))

(defn- deserialization-prescan []
  (into {} (for [model exported-models]
             [(name model) (deserialization-prescan-model model)])))

(defn- path-parts [path]
  (->> (java.nio.file.Paths/get path (into-array String []))
       (.iterator)
       (iterator-seq)
       (map #(.toString %))))

(defn- id-from-path [path]
  (let [file (last (path-parts path))
        base (.substring file 0 (.lastIndexOf file "."))
        ; Things with human-readable names use the form identity_hash+human_name.yaml
        plus (.indexOf base "+")]
    (if (< plus 0)
      base
      (.substring base 0 plus))))

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

(declare deserialize-one)

(defn- deserialize-deps [ctx deps]
  (if (empty? deps)
    ctx
    (reduce deserialize-one ctx (map (:id->file ctx) deps))))

(defn- deserialize-one [{:keys [expanding seen src] :as ctx} path]
  (let [id    (id-from-path path)]
    (cond
      (expanding id) (throw (ex-info (format "Circular dependency on %s" path) {}))
      (seen id)      ctx ; Already been done, just skip it.
      :else (let [contents (src path)
                  model    (db/resolve-model (symbol (:serdes_type contents)))
                  deps     (serdes-dependencies contents)
                  ctx'     (-> ctx
                               (update :expanding conj id)
                               (update :seen conj id)
                               (deserialize-deps deps)
                               (update :expanding disj id))]
              (deserialize-file model
                                (dissoc contents :serdes_type)
                                (or (get-in ctx [:local (name model) :by-entity-id id])
                                    (get-in ctx [:local (name model) :by-identity-hash id])))
              ctx'))))

(defn deserialize-metabase
  "Deserializes a complete database export from a 'deserialization source', which can be created with
  `deserialization-source-foo`. This doesn't read directly from files for ease of testing."
  [src]
  ;; We proceed in a random order, deserializing all the files. Their declared dependencies guide the import, and make
  ;; sure all containers are imported before contents, etc.
  (let [paths    (src)]
    (reduce deserialize-one {:id->file  (into {} (for [p paths]
                                                   [(id-from-path p) p]))
                             :local     (deserialization-prescan)
                             :expanding #{}
                             :seen      #{}
                             :src       src}
            paths)))


(comment
  (scan-ids (db/select-one 'Collection :id 1))
  (deserialization-prescan)
  (-> (into [] (serialize-metabase 1))
      (deserialization-source-memory)
      (deserialize-metabase)))
