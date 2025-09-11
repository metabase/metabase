(ns metabase-enterprise.library.source
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(defprotocol LibrarySource
  (branches [source]
    "Returns a map of branch names available in the source")

  (list-files [source branch]
    "Lists all files in the source")

  (read-file [source branch path]
    "Reads the contents of the file at `path` in `branch`")

  (write-files! [source branch message files]
    "Writes `content` to `path` in `branch` with commit `message` for all files in `files`"))

(def ^:dynamic *source*
  "The library source"
  (atom nil))

(defn get-source
  "The library source"
  []
  @*source*)

(defn set-source!
  "Sets the library source based on the configuration settings"
  [source]
  (reset! *source* source))

(defn- ingest-content
  [file-content]
  (v2.ingest/read-timestamps (yaml/load file-content {:key-fn v2.ingest/parse-key})))

(defn- ingest-all
  [source branch]
  (into {} (for [path (list-files source branch)
                 :when (and (not (str/starts-with? path "."))
                            (str/ends-with? path ".yaml"))
                 ;; TODO legal-top-level check? / maybe not necessary for library?
                 :let [content (try
                                 (read-file source branch path)
                                 (catch Exception e
                                   (log/error e "Error reading file" path)))
                       loaded (try
                                (when content
                                  (serdes/path (ingest-content content)))
                                (catch Exception e
                                  (log/error e "Error reading file" path)))]
                 :when loaded]
             [(v2.ingest/strip-labels loaded) [loaded content]])))

;; Wraps a source object providing the ingestable interface for serdes
(defrecord IngestableSource [source branch cache]
  v2.ingest/Ingestable
  (ingest-list [_]
    (keys (or @cache (reset! cache (ingest-all source branch)))))

  (ingest-one [this abs-path]
    (when-not @cache
      (reset! cache (ingest-all source branch)))
    (if-let [target (get (v2.ingest/ingest-list this) (v2.ingest/strip-labels abs-path))]
      (try
        (ingest-content (second target))
        (catch Exception e
          (throw (ex-info "Unable to ingest file" {:abs-path abs-path} e))))
      (throw (ex-info "Cannot find file" {:abs-path abs-path})))))

(defn ingestable-source
  [source branch]
  (->IngestableSource source branch (atom {})))
