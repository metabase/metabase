(ns metabase-enterprise.serialization.dump
  "Serialize entities into a directory structure of YAMLs."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private serialization-order
  (delay (-> (edn/read-string (slurp (io/resource "serialization-order.edn")))
             (update-vals (fn [order]
                            (into {} (map vector order (range))))))))

(defn- compare-keys
  "Compare two map keys, which are not always of one kind: a JSON column can hold keyword keys next to the string keys
  of the objects it does not type, and `compare` cannot order a keyword against a string."
  [k1 k2]
  (if (or (and (keyword? k1) (keyword? k2))
          (and (string? k1) (string? k2)))
    (compare k1 k2)
    (compare (u/qualified-name k1) (u/qualified-name k2))))

(defn- serialization-sorted-map* [order-key]
  (if-let [order (or (get @serialization-order order-key)
                     (get @serialization-order (last order-key)))]
    ;; known columns are sorted by their order, then unknown are sorted alphabetically
    (sorted-map-by (fn [k1 k2]
                     (let [i1 (get order k1)
                           i2 (get order k2)]
                       (cond
                         (and i1 i2) (compare i1 i2)
                         i1          -1
                         i2          1
                         :else       (compare-keys k1 k2)))))
    (sorted-map-by compare-keys)))

(def ^:private serialization-sorted-map (memoize/memo serialization-sorted-map*))

(defn serialization-deep-sort
  "Provide a deterministic sort for maps before serialization."
  ([m]
   (let [model (-> (:serdes/meta m) last :model)]
     (serialization-deep-sort m [(keyword model)])))
  ([m path]
   (cond
     (map? m)  (into (serialization-sorted-map path)
                     (for [[k v] m]
                       [k (serialization-deep-sort v (conj path k))]))
     (sequential? m) (mapv #(serialization-deep-sort % path) m)
     :else                  m)))

(defn yaml-content
  "Generate the YAML string version of the object"
  [obj]
  (yaml/generate-string (serialization-deep-sort obj)
                        {:dumper-options {:flow-style :block :split-lines false}}))

(defn spit-yaml!
  "Writes obj to filename and creates parent directories if necessary.

  Writes (even nested) yaml keys in a deterministic fashion."
  [filename obj]
  (io/make-parents filename)
  (try
    (spit filename (yaml-content obj))
    (catch Exception e
      (if-not (.canWrite (.getParentFile (io/file filename)))
        (throw (ex-info (format "Destination path is not writeable: %s" filename) {:filename filename}))
        (throw e)))))
