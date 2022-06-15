(ns metabase-enterprise.serialization.v2.deserialize
  (:require [metabase-enterprise.serialization.v2.models :as serdes.models]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [toucan.db :as db]
            [toucan.models :as models]))

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
  (into {} (for [model serdes.models/exported-models]
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
                  deps     (serdes.base/serdes-dependencies contents)
                  ctx'     (-> ctx
                               (update :expanding conj id)
                               (update :seen conj id)
                               (deserialize-deps deps)
                               (update :expanding disj id))]
              (serdes.base/deserialize-file
                model
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
  (-> (into [] (metabase-enterprise.serialization.v2.serialize/serialize-metabase 1))
      (deserialization-source-memory)
      (deserialize-metabase)))
