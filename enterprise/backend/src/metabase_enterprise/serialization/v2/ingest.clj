(ns metabase-enterprise.serialization.v2.ingest
  "Ingestion is the first step in deserialization - reading from the export format (eg. a tree of YAML files) and
  producing Clojure maps with `:serdes/meta` keys.

  See the detailed description of the (de)serialization processes in [[metabase.models.serialization]]."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.storage.kind-layout :as kind-layout]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.memoize :as u.memo]
   [metabase.util.yaml :as yaml]
   [potemkin.types :as p])
  (:import (java.io File)))

(set! *warn-on-reflection* true)

(p/defprotocol+ Ingestable
  ;; Represents a data source for deserializing previously-exported appdb content into this Metabase instance.
  ;; This is written as a protocol since overriding it with [[reify]] is useful for testing.
  (ingest-list
    [this]
    "Return a reducible stream of `:serdes/meta`-style abstract paths, one for each entity in the dump.
    See the description of these abstract paths in [[metabase.models.serialization]].
    Each path is ordered from the root to the leaf.

    The order of the whole list is not specified and should not be relied upon!")

  (ingest-one
    [this path]
    "Given one of the `:serdes/meta` abstract paths returned by [[ingest-list]], read in and return the entire
    corresponding entity.")

  (ingest-errors
    [this]
    "Return a vector of exceptions that occurred during ingestion (e.g. YAML parse failures).
    Returns [] if no errors occurred."))

(defn read-timestamps
  "Parses timestamp fields in an entity.

  Args:
    entity: A map containing entity data with potential timestamp fields.

  Returns:
    The entity with timestamp fields parsed using u.date/parse.
    Processes fields ending with '_at' and the special :last_analyzed field."
  [entity]
  (->> (keys entity)
       (filter #(or (#{:last_analyzed} %)
                    (.endsWith (name %) "_at")))
       (reduce #(update %1 %2 u.date/parse) entity)))

(defn parse-key
  "Convert suitable string keys to clojure keywords, ignoring keys with whitespace, etc."
  [{k :key}]
  (if (and (string? k)
           (re-matches #"^[0-9a-zA-Z_\./\-]+$" k))
    (keyword k)
    k))

(defn strip-labels
  "Removes :label keys from all maps in a hierarchy.

  Args:
    hierarchy: A collection of maps that may contain :label keys.

  Returns:
    A vector with :label keys removed from each map in the hierarchy."
  [hierarchy]
  (mapv #(dissoc % :label) hierarchy))

(defn- ingest-file
  "Reads an entity YAML file and clean it up (eg. parsing timestamps)
  The returned entity is in \"extracted\" form, ready to be passed to the `load` step."
  [file]
  (-> file
      (yaml/from-file {:key-fn parse-key})
      read-timestamps
      serdes/restore-path))

(defn- check-resource-path!
  "Throws unless `path` is a relative path that stays inside its entity's directory."
  [path]
  (when-not (and (string? path)
                 (not (str/starts-with? path "/"))
                 (not (str/includes? path "\\"))
                 (not-any? #{"" "." ".."} (str/split path #"/" -1)))
    (throw (ex-info (format "Invalid resource file path: %s" path) {:path path}))))

(defn read-resources
  "The ingested `entity` with each of its [[serdes/resource-paths]] read by `read-fn` into `:serdes/resources`."
  [entity read-fn]
  (if-let [paths (seq (serdes/resource-paths entity))]
    (assoc entity :serdes/resources (into {}
                                          (map (fn [path]
                                                 (check-resource-path! path)
                                                 [path (read-fn path)]))
                                          paths))
    entity))

(def ^:private legacy-top-level-paths
  "The top-level paths of the layout every export wrote before the kind layout. We support both \"python-libraries\"
  and \"python_libraries\" for backwards compatibility."
  #{"actions" "channels" "collections" "custom_viz_plugins" "data_apps" "databases" "embedding_themes" "glossary" "metabots" "python_libraries" "python-libraries" "osi_ai_context" "snippets" "transforms"})

(defn- data-app-entity-file?
  "Whether `path`, under `data_apps/`, names an entity file: an app's `data_app.yaml`, or a YAML file in the folder of
  its resource collection, `data_apps/<slug>/resources/`."
  [^String path]
  (or (str/ends-with? path "/data_app.yaml")
      (boolean (re-matches #"data_apps/[^/]+/resources/.+\.yaml" path))))

(def legal-top-level-paths
  "Known top-level paths for directory with serialization output: those of the layout every export wrote before the
  kind layout, and those of the kind layout."
  (into legacy-top-level-paths kind-layout/top-level-folders))

(def ^:private kind-only-top-level-paths
  "The top-level paths of the kind layout that the layout before it did not write."
  (apply disj kind-layout/top-level-folders legacy-top-level-paths))

(def shared-top-level-paths
  "The [[legal-top-level-paths]] whose directories may also hold files serialization does not own, such as a data
  app's source code, to a predicate of a `.yaml` file's path that says whether it may be an entity file. In the
  folders of [[content-checked-path?]] a file must also pass [[entity-content?]]."
  (into {"data_apps" data-app-entity-file?}
        (for [folder (remove legacy-top-level-paths kind-layout/top-level-folders)]
          [folder (constantly true)])))

(defn content-checked-path?
  "Whether a YAML file at the `/`-separated `path` is an entity file only when its content is one
  ([[entity-content?]]): a file in a top-level folder that only the kind layout writes, or in a data app's
  `resources/` folder. A repository may hold its own YAML files there; exports leave them, and imports skip them."
  [^String path]
  (boolean (or (contains? kind-only-top-level-paths (first (str/split path #"/" 2)))
               (re-matches #"data_apps/[^/]+/resources/.+" path))))

(defn entity-content?
  "Whether the YAML text `content` is a serialized entity: a map with a `serdes/meta` key."
  [content]
  (boolean (try
             (let [parsed (yaml/parse-string content)]
               (and (map? parsed) (contains? parsed :serdes/meta)))
             (catch Exception _
               false))))

(def replaced-top-level-paths
  "The [[legal-top-level-paths]] a full export may replace wholesale."
  (apply disj legal-top-level-paths (keys shared-top-level-paths)))

(defn entity-file-path?
  "Whether the `/`-separated relative `path` names an entity YAML file: a `.yaml` file that isn't a dotfile under one
  of the [[legal-top-level-paths]], which its folder's predicate accepts when that is one of the
  [[shared-top-level-paths]]."
  [^String path]
  (let [top       (first (str/split path #"/" 2))
        file-name (subs path (inc (or (str/last-index-of path "/") -1)))]
    (boolean (and (str/includes? path "/")
                  (str/ends-with? file-name ".yaml")
                  (not (str/starts-with? file-name "."))
                  (contains? legal-top-level-paths top)
                  (if-let [entity-file? (get shared-top-level-paths top)]
                    (entity-file? path)
                    true)))))

(defn- path-interner
  "Returns a function that interns `:serdes/meta` path vectors.

  Every parsed file allocates fresh copies of its path maps and strings, but the
  `[db schema table]` prefix segments recur once per sibling file (a million-field instance
  has ~#tables distinct prefixes). Interning each segment (and its strings) collapses those
  duplicates to shared objects, so index keys share structure — value equality is unchanged,
  so lookups and `:seen`-set comparisons behave identically. The interner caches live only as
  long as the returned function is reachable; do not hold it past index construction."
  []
  (let [intern-str (u.memo/fast-interner)
        intern-seg (u.memo/fast-interner
                    (fn [seg]
                      (cond-> (update seg :model intern-str)
                        (string? (:id seg)) (update :id intern-str))))]
    (fn intern-path [hierarchy]
      (mapv intern-seg hierarchy))))

(defn- ingestible-file?
  "Whether `file` is a regular file that [[entity-file-path?]] accepts, and, in a folder of [[content-checked-path?]],
  whose content is an entity. Dotfiles are excluded (editor temp files, see #41567)."
  [^File root-dir ^File file]
  (let [path (str/replace (str (.relativize (.toPath root-dir) (.toPath file))) "\\" "/")]
    (and (.isFile file)
         (entity-file-path? path)
         (or (not (content-checked-path? path))
             (entity-content? (slurp file))))))

(defn- file-hierarchy!
  "Parses `file` and returns its `:serdes/meta` abstract path, or nil on parse failure.
  On failure the exception is recorded in the `errors` atom."
  [^File file errors]
  (try
    (serdes/path (ingest-file file))
    (catch Exception e
      (log/warn (u/strip-error e "Error reading file during ingestion"))
      (let [file-name (.getName file)]
        (swap! errors conj (ex-info (format "Failed to parse file: %s" file-name)
                                    {:file file-name} e)))
      nil)))

(defn- ingest-all
  "Returns {:entities {unlabeled-hierarchy File}, :errors [Exception...]}.
  Dotfiles are silently skipped (editor temp files, see #41567).
  Non-dotfile YAML parse failures are collected in :errors."
  [^File root-dir]
  (let [errors      (atom [])
        intern-path (path-interner)]
    {:entities (into {} (for [^File file (file-seq root-dir)
                              :when (ingestible-file? root-dir file)
                              :let  [hierarchy (file-hierarchy! file errors)]
                              :when hierarchy]
                          [(intern-path (strip-labels hierarchy)) file]))
     :errors  @errors}))

(defn- populate-cache! [cache errors-atom ingest-fn]
  (when-not @cache
    (let [result (ingest-fn)]
      (reset! cache (:entities result))
      (reset! errors-atom (:errors result)))))

(deftype YamlIngestion [^File root-dir settings cache errors-atom]
  Ingestable
  (ingest-list [_]
    (populate-cache! cache errors-atom #(ingest-all root-dir))
    (-> @cache
        keys
        (concat (for [k (keys settings)]
                  [{:model "Setting" :id (name k)}]))))

  (ingest-one [_ serdes-meta]
    (populate-cache! cache errors-atom #(ingest-all root-dir))
    (let [{:keys [id]} (first serdes-meta)
          kw-id        (keyword id)]
      (if (= ["Setting"] (mapv :model serdes-meta))
        (when (contains? settings kw-id)
          {:serdes/meta serdes-meta :key kw-id :value (get settings kw-id)})
        (when-let [file (get @cache (strip-labels serdes-meta))]
          (try
            (read-resources (ingest-file file)
                            (fn [path]
                              (let [resource (io/file (.getParentFile ^File file) ^String path)]
                                (when (.isFile resource)
                                  (slurp resource)))))
            (catch Exception e
              (throw (ex-info "Unable to ingest file" {:file     (.getName ^File file)
                                                       :abs-path serdes-meta} e))))))))

  (ingest-errors [_]
    (or @errors-atom [])))

(defn ingest-yaml
  "Creates a new Ingestable on a directory of YAML files, as created by
  [[metabase-enterprise.serialization.v2.storage.yaml]]."
  [root-dir]
  (->YamlIngestion (io/file root-dir) (yaml/from-file (io/file root-dir "settings.yaml")) (atom nil) (atom [])))
