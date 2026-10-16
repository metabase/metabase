(ns metabase-enterprise.serialization.dump
  "Serialize entities into a directory structure of YAMLs."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private serialization-order
  (delay (-> (edn/read-string (slurp (io/resource "serialization-order.edn")))
             (update-vals (fn [order]
                            (into {} (map vector order (range))))))))

(def ^:private trailing-keys
  "Keys that come after every other key of a map at a path, in this order: in a table's file, the table's schema and
  its columns; in a column's entry, its remapping and its schema."
  {[:Table]          {:metadata 0 :columns 1}
   [:Table :columns] {:remapping 0 :metadata 1}})

(def ^:private leading-keys
  "Keys that come before every other key of a map at a path that has no order of its own."
  {[:Table :columns] {:name 0 :parents 1}})

(defn- serialization-sorted-map* [order-key]
  (let [trailing (get trailing-keys order-key {})
        order    (or (get leading-keys order-key)
                     (get @serialization-order order-key)
                     (get @serialization-order (last order-key)))]
    (if (or order (seq trailing))
      ;; known columns are sorted by their order, then unknown are sorted alphabetically, then the trailing ones
      (let [getter #(cond
                      (contains? trailing %) [2 (get trailing %)]
                      (contains? order %)    [0 (get order %)]
                      :else                  [1 %])]
        (sorted-map-by (fn [k1 k2]
                         (compare (getter k1) (getter k2)))))
      (sorted-map))))

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
