(ns metabase.util.yaml
  "Convenience functions for parsing and generating YAML."
  (:refer-clojure :exclude [load])
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]}
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

(def ^:const nesting-depth-limit
  "Maximum YAML nesting depth allowed when parsing.

  SnakeYAML defaults to 50, which is too shallow for deeply nested MBQL. MBQL sometimes contains expressions with many
  nested function calls like `replace(replace(...))`. There's no depth limit on the YAML output, so they are perfectly
  valid queries that can be saved, executed and exported. But with the default depth limit, they cannot be imported,
  leaving remote-sync users stuck (see #71257 / UXW-3770).

  We raise the limit so that anything Metabase can export can also be re-imported, while keeping a finite bound as a
  sanity guard against pathological/malicious input. Callers may override via the `:nesting-depth-limit` opt."
  10000)

(defn- with-parse-defaults
  "Merges Metabase's default parsing options into `opts`; preserving any values the caller supplied."
  [opts]
  (merge {:nesting-depth-limit nesting-depth-limit} opts))

(defn parse-stream
  "Returns Clojure data structures for a stream of YAML read from `reader`, with opts passed to
  clj-yaml. Applies Metabase's default parsing options (see [[with-parse-defaults]])."
  [reader & {:as opts}]
  (yaml/parse-stream reader (with-parse-defaults opts)))

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
      (vectorized (parse-stream r opts)))))

(defn generate-string
  "Returns a YAML string from Clojure value x"
  [x & {:as opts}]
  (yaml/generate-string x opts))

(defn parse-string
  "Returns a Clojure object parsed from YAML in string s with opts passed to clj-yaml.
  Applies Metabase's default parsing options (see [[with-parse-defaults]])."
  [s & {:as opts}]
  (vectorized (yaml/parse-string s (with-parse-defaults opts))))

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
