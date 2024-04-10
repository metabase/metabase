(ns metabase.util.yaml
  "Convenience functions for parsing and generating YAML."
  (:refer-clojure :exclude [load])
  (:require
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log])
  (:import
   (java.nio.file Files Path)
   (java.time.temporal Temporal)))

(set! *warn-on-reflection* true)

(defn- vectorized
  "Returns x with lazy seqs converted to vectors wherever they appear in the data structure."
  [x]
  (cond
    (map? x)        (update-vals x vectorized)
    (sequential? x) (mapv vectorized x)
    :else           x))

(extend-protocol yaml/YAMLCodec
  Temporal
  (encode [data]
    (u.date/format data)))

(defn from-file
  "Returns YAML parsed from file/file-like/path f, with options passed to clj-yaml."
  [f & {:as opts}]
  (when (.exists (io/file f))
    (with-open [r (io/reader f)]
      (vectorized (yaml/parse-stream r opts)))))

(defn generate-string
  "Returns a YAML string from Clojure value x"
  [x & {:as opts}]
  (yaml/generate-string x opts))

(defn parse-string
  "Returns a Clojure object parsed from YAML in string s with opts passed to clj-yaml."
  [s & {:as opts}]
  (vectorized (yaml/parse-string s opts)))

;; Legacy API:

(defn load
  "Load YAML at path `f`, parse it, and (optionally) pass the result to `constructor`."
  ([f] (load identity f))
  ([constructor ^Path f]
   (try
     (-> f .toUri slurp parse-string constructor)
     (catch Exception e
       (log/errorf "Error parsing %s:\n%s"
                   (.getFileName f)
                   (or (some-> e
                               ex-data
                               (select-keys [:error :value])
                               u/pprint-to-str)
                       e))
       (throw e)))))

(defn load-dir
  "Load and parse all YAMLs in `dir`. Optionally pass each resulting data structure through `constructor-fn`."
  ([dir] (load-dir dir identity))
  ([dir constructor]
   (u.files/with-open-path-to-resource [dir dir]
     (with-open [ds (Files/newDirectoryStream dir)]
       (->> ds
            (filter (comp #(str/ends-with? % ".yaml") u/lower-case-en (memfn ^Path getFileName)))
            (mapv (partial load constructor)))))))
