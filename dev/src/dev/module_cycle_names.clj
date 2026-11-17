(ns dev.module-cycle-names
  "Reads and validates the file that names the module require graph's cyclic clusters.
  Plain Clojure, so the Babashka-run module explorer can show the names too."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def clusters-file
  "The file of cluster names, relative to the repo root."
  ".clj-kondo/config/modules/cycle-clusters.edn")

(defn- read-form
  "The one EDN form in the file at `path`. Throws when the file is empty or holds a second form."
  [path]
  (with-open [reader (java.io.PushbackReader. (io/reader path))]
    (let [eof  (Object.)
          form (edn/read {:eof eof} reader)]
      (when (identical? eof form)
        (throw (ex-info (str path " is empty; expected a map of cluster name to anchor module")
                        {:file path})))
      (when-not (identical? eof (edn/read {:eof eof} reader))
        (throw (ex-info (str path " holds more than one form; expected one map")
                        {:file path})))
      form)))

(defn validate-anchors
  "Return `anchors` if it maps simple-symbol names to module symbols, no module anchoring two; throw otherwise."
  [anchors]
  (when-not (map? anchors)
    (throw (ex-info (str clusters-file " must hold a map of cluster name to anchor module, not " (pr-str anchors))
                    {:anchors anchors})))
  (doseq [[cluster-name anchor] anchors]
    (when-not (simple-symbol? cluster-name)
      (throw (ex-info (format "%s is not a cluster name; names are simple symbols" (pr-str cluster-name))
                      {:cluster cluster-name})))
    (when-not (symbol? anchor)
      (throw (ex-info (format "%s must be anchored by a module symbol, not %s" cluster-name (pr-str anchor))
                      {:cluster cluster-name, :anchor anchor}))))
  (doseq [[anchor names] (group-by val anchors)
          :when (< 1 (count names))]
    (throw (ex-info (format "%s anchors more than one cluster: %s" anchor (str/join ", " (sort (map key names))))
                    {:anchor anchor, :clusters (sort (map key names))})))
  anchors)

(defn read-anchors
  "Parsed and validated contents of the file at `path`, [[clusters-file]] by default."
  ([]
   (read-anchors clusters-file))
  ([path]
   (when-not (.exists (io/file path))
     (throw (ex-info (str path " is missing") {:file path})))
   (validate-anchors (read-form path))))
