(ns metabase.util.yaml
  (:refer-clojure :exclude [load])
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log])
  (:import
   (java.nio.file Files Path)))

(set! *warn-on-reflection* true)

(defn- fix-values
  "Returns x with lazy seqs and ordered maps from YAML replaced with vectors and hash-maps as expected by
   most consumers of from-file."
  [x]
  (cond
    (map? x)        (zipmap (keys x) (map fix-values (vals x)))
    (sequential? x) (mapv fix-values x)
    :else           x))

(defn from-file
  "Returns YAML parsed from file/file-like/path f, with options passed to clj-yaml parser"
  [f & options]
  (when (.exists (io/file f))
    (fix-values
     (apply yaml/parse-string (slurp (io/file f)) options))))

(defn load
  "Load YAML at path `f`, parse it, and (optionally) pass the result to `constructor`."
  ([f] (load identity f))
  ([constructor ^Path f]
   (try
     (->> f
          .toUri
          slurp
          yaml/parse-string
          constructor)
     (catch Exception e
       (log/error (trs "Error parsing {0}:\n{1}"
                       (.getFileName f)
                       (or (some-> e
                                   ex-data
                                   (select-keys [:error :value])
                                   u/pprint-to-str)
                           e)))
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
