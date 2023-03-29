(ns metabase-enterprise.serialization.v2.utils.yaml
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.models.serialization.base :as serdes.base])
  (:import
   (java.io File)
   (java.nio.file Path)))

(set! *warn-on-reflection* true)

(defn- escape-segment
  "Given a path segment, which is supposed to be the name of a single file or directory, escape any slashes inside it.
  This occurs in practice, for example with a `Field.name` containing a slash like \"Company/organization website\"."
  [segment]
  (-> segment
      (str/replace "/"  "__SLASH__")
      (str/replace "\\" "__BACKSLASH__")))

(defn- unescape-segment
  "Given an escaped path segment (see [[escape-segment]]), this reverses the escaping and restores the original name."
  [segment]
  (-> segment
      (str/replace "__SLASH__"     "/")
      (str/replace "__BACKSLASH__" "\\")))

(defn hierarchy->file
  "Given an extracted entity, return a [[File]] corresponding to it."
  ^File [ctx entity]
  (let [;; Get the desired [[serdes.base/storage-path]].
        base-path   (serdes.base/storage-path entity ctx)
        dirnames    (drop-last base-path)
        ;; Attach the file extension to the last part.
        basename    (str (last base-path) ".yaml")]
    (apply io/file (:root-dir ctx) (map escape-segment (concat dirnames [basename])))))

(defn path-split
  "Given a root directory and a file underneath it, return a sequence of path parts to get there.
  Given a root of /foo and file /foo/bar/baz/this.file, returns `[\"bar\" \"baz\" \"this.file\"]`."
  [^File root-dir ^File file]
  (let [relative (.relativize (.toPath root-dir) (.toPath file))]
    (for [^Path path (iterator-seq (.iterator relative))]
      (.getName (.toFile path)))))

(defn path->hierarchy
  "Given the list of file path chunks as returned by [[path-split]], reconstruct the `:serdes/meta` abstract path
  corresponding to it.
  Note that the __SLASH__ and __BACKSLASH__ interpolations of [[escape-segment]] are reversed here, and also the
  file extension is stripped off the last segment.

  The heavy lifting is done by the matcher functions registered by each model using
  [[serdes.base/register-ingestion-path!]]."
  [path-parts]
  (let [basename         (last path-parts)
        basename         (if (str/ends-with? basename ".yaml")
                           (subs basename 0 (- (count basename) 5))
                           basename)
        path-parts       (concat (map unescape-segment (drop-last path-parts))
                                 [(unescape-segment basename)])]
    (serdes.base/ingest-path path-parts)))

(defn log-path-str
  "Returns a string for logging from a serdes path sequence (i.e. in :serdes/meta)"
  [elements]
  (->> elements (map #(str (:model %) " " (:id %))) (str/join " > ")))
