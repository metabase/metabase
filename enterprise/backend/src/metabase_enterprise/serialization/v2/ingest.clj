(ns metabase-enterprise.serialization.v2.ingest
  "Ingestion is the first step in deserialization - reading from the export format (eg. a tree of YAML files) and
  producing Clojure maps with `:serdes/meta` keys.

  See the detailed description of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.models.serialization :as serdes]
   [metabase.util.date-2 :as u.date]
   [potemkin.types :as p]
   [yaml.core :as yaml]
   [yaml.reader :as y.reader])
  (:import (java.io File)
           (java.nio.file Path)
           (java.time.temporal Temporal)))

(set! *warn-on-reflection* true)

(p/defprotocol+ Ingestable
  ;; Represents a data source for deserializing previously-exported appdb content into this Metabase instance.
  ;; This is written as a protocol since overriding it with [[reify]] is useful for testing.
  (ingest-list
    [this]
    "Return a reducible stream of `:serdes/meta`-style abstract paths, one for each entity in the dump.
    See the description of these abstract paths in [[metabase.models.serialization.base]].
    Each path is ordered from the root to the leaf.

    The order of the whole list is not specified and should not be relied upon!")

  (ingest-one
    [this path]
    "Given one of the `:serdes/meta` abstract paths returned by [[ingest-list]], read in and return the entire
    corresponding entity."))

(extend-type Temporal y.reader/YAMLReader
             (decode [data]
               (u.date/parse data)))

(defn- build-settings [file]
  (let [settings (yaml/from-file file)]
    (for [[k _] settings]
      ; We return a path of 1 item, the setting itself.
      [{:model "Setting" :id (name k)}])))

(defn- unescape-segment
  "Given an escaped path segment (see [[escape-segment]]), this reverses the escaping and restores the original name."
  [segment]
  (-> segment
      (str/replace "__SLASH__"     "/")
      (str/replace "__BACKSLASH__" "\\")))

(defn path->hierarchy
  "Given the list of file path chunks as returned by [[path-split]], reconstruct the `:serdes/meta` abstract path
  corresponding to it.
  Note that the __SLASH__ and __BACKSLASH__ interpolations of [[escape-segment]] are reversed here, and also the
  file extension is stripped off the last segment.

  The heavy lifting is done by the matcher functions registered by each model using
  [[serdes/register-ingestion-path!]]."
  [path-parts]
  (let [basename         (last path-parts)
        basename         (if (str/ends-with? basename ".yaml")
                           (subs basename 0 (- (count basename) 5))
                           basename)
        path-parts       (concat (map unescape-segment (drop-last path-parts))
                                 [(unescape-segment basename)])]
    (serdes/ingest-path path-parts)))

(defn- path-split
  "Given a root directory and a file underneath it, return a sequence of path parts to get there.
  Given a root of /foo and file /foo/bar/baz/this.file, returns `[\"bar\" \"baz\" \"this.file\"]`."
  [^File root-dir ^File file]
  (let [relative (.relativize (.toPath root-dir) (.toPath file))]
    (for [^Path path (iterator-seq (.iterator relative))]
      (.getName (.toFile path)))))

(defn- build-metas [^File root-dir ^File file]
  (let [path-parts (path-split root-dir file)]
    (if (= ["settings.yaml"] path-parts)
      (build-settings file)
      [(path->hierarchy path-parts)])))

(defn- read-timestamps [entity]
  (->> (keys entity)
       (filter #(or (#{:last_analyzed} %)
                    (.endsWith (name %) "_at")))
       (reduce #(update %1 %2 u.date/parse) entity)))

(defn- keywords [obj]
  (cond
    (map? obj)        (m/map-kv (fn [k v]
                                  [(if (re-matches #"^[0-9a-zA-Z_\./\-]+$" k)
                                     (keyword k)
                                     k)
                                   (keywords v)])
                                obj)
    (sequential? obj) (mapv keywords obj)
    :else             obj))

(defn- strip-labels [hierarchy]
  (mapv #(dissoc % :label) hierarchy))

(defn- ingest-entity
  "Given a hierarchy, read in the YAML file it identifies. Clean it up (eg. parsing timestamps) and attach the
  hierarchy as `:serdes/meta`.
  The returned entity is in \"extracted\" form, ready to be passed to the `load` step.

  The labels are removed from the hierarchy attached at `:serdes/meta`, since the storage system might have damaged the
  original labels by eg. truncating them to keep the file names from getting too long. The labels aren't used at all on
  the loading side, so it's fine to drop them."
  [hierarchy ^File file]
  (-> (when (.exists file) file) ; If the returned file doesn't actually exist, replace it with nil.

      ;; No automatic keywords; it's too generous with what counts as a keyword and has a bug.
      ;; See https://github.com/clj-commons/clj-yaml/issues/64
      (yaml/from-file false)
      keywords
      read-timestamps
      (assoc :serdes/meta (strip-labels hierarchy)))) ; But return the hierarchy without labels.

(def ^:private legal-top-level-paths
  "These are all the legal first segments of paths. This is used by ingestion to avoid `.git`, `.github`, `README.md`
  and other such extras."
  #{"actions" "collections" "databases" "snippets" "settings.yaml"})

(defn- ingest-all [^File root-dir]
  ;; This returns a map {unlabeled-hierarchy [original-hierarchy File]}.
  (into {} (for [^File file (file-seq root-dir)
                 :when      (and (.isFile file)
                                 (let [rel (.relativize (.toPath root-dir) (.toPath file))]
                                   (-> rel (.subpath 0 1) (.toString) legal-top-level-paths)))
                 hierarchy (build-metas root-dir file)]
             [(strip-labels hierarchy) [hierarchy file]])))

(deftype YamlIngestion [^File root-dir settings cache]
  Ingestable
  (ingest-list [_]
    (->> (or @cache
             (reset! cache (ingest-all root-dir)))
         vals
         (map first)))

  (ingest-one [_ abs-path]
    (when-not @cache
      (reset! cache (ingest-all root-dir)))
    (let [{:keys [model id]} (first abs-path)]
      (if (and (= (count abs-path) 1)
               (= model "Setting"))
        {:serdes/meta abs-path :key (keyword id) :value (get settings (keyword id))}
        (->> abs-path
             strip-labels
             (get @cache)
             second
             (ingest-entity abs-path))))))

(defn ingest-yaml
  "Creates a new Ingestable on a directory of YAML files, as created by
  [[metabase-enterprise.serialization.v2.storage.yaml]]."
  [root-dir]
  (->YamlIngestion (io/file root-dir) (yaml/from-file (io/file root-dir "settings.yaml")) (atom nil)))
