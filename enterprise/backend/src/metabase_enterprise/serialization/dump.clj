(ns metabase-enterprise.serialization.dump
  "Serialize entities into a directory structure of YAMLs."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private serialization-order
  (delay (-> (edn/read-string (slurp (io/resource "serialization-order.edn")))
             (update-vals (fn [order]
                            (into {} (map vector order (range))))))))

(defn- serialization-sorted-map* [order-key]
  (if-let [order (or (get @serialization-order order-key)
                     (get @serialization-order (last order-key)))]
    ;; known columns are sorted by their order, then unknown are sorted alphabetically
    (let [getter #(if (contains? order %)
                    [0 (get order %)]
                    [1 %])]
      (sorted-map-by (fn [k1 k2]
                       (compare (getter k1) (getter k2)))))
    (sorted-map)))

(def ^:private serialization-sorted-map (memoize serialization-sorted-map*))

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
     (and (sequential? m)
          (map? (first m))) (mapv #(serialization-deep-sort % path) m)
     :else                  m)))

(defn spit-yaml!
  "Writes obj to filename and creates parent directories if necessary.

  Writes (even nested) yaml keys in a deterministic fashion."
  [filename obj]
  (io/make-parents filename)
  (try
    (spit filename (yaml/generate-string (serialization-deep-sort obj)
                                         {:dumper-options {:flow-style :block :split-lines false}}))
    (catch Exception e
      (if-not (.canWrite (.getParentFile (io/file filename)))
        (throw (ex-info (format "Destination path is not writeable: %s" filename) {:filename filename}))
        (throw e)))))
