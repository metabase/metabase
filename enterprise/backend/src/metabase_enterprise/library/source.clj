(ns metabase-enterprise.library.source
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defprotocol LibrarySource
  (branches [source]
    "Returns a map of branch names available in the source")

  (list-files [source branch]
    "Lists all files in the source")

  (read-file [source branch path]
    "Reads the contents of the file at `path` in `branch`")

  (write-file! [source branch message path content]
    "Writes `content` to the file at `path` in `branch` with commit `message`"))

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

(defn- ingest-all
  [source branch]
  (into {} (for [path (list-files source branch)
                 :when (and (not (str/starts-with? path "."))
                            (str/ends-with? path ".yaml"))
                 ;; TODO legal-top-level check? / maybe not necessary for library?
                 :let [file (io/file path)
                       loaded (try
                                (serdes/path (v2.ingest/ingest-file file))
                                (catch Exception e
                                  (log/error e "Error reading file" path)))]
                 :when loaded]
             [(mapv #(dissoc % :label) loaded) [loaded file]])))

(defrecord IngestableSource [source branch]
  "Wraps a source object providing the ingestable interface for serdes"
  v2.ingest/Ingestable
  (ingest-list [_]
    (keys (ingest-all source branch)))

  (ingest-one [_ abs-path]
    (throw (ex-info "ingest-one not supported for library sources" {:source source
                                                                    :branch branch
                                                                    :abs-path abs-path}))))
