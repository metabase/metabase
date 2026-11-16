(ns metabase-enterprise.serialization.v2.ingest
  "Ingestion is the first step of an import: reading the export format (eg. a tree of YAML files) into exported
  entities, each named by its `[model ref]` key (see [[metabase.serialization.core/key-of]])."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.models :as models]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [potemkin.types :as p])
  (:import (java.io File)))

(set! *warn-on-reflection* true)

(p/defprotocol+ Ingestable
  ;; Represents a data source for deserializing previously-exported appdb content into this Metabase instance.
  ;; This is written as a protocol since overriding it with [[reify]] is useful for testing.
  (ingest-list
    [this]
    "Return a reducible stream of the `[model ref]` keys of the entities in the dump, in no particular order.")

  (ingest-many
    [this ks]
    "Given a batch of the keys [[ingest-list]] returns, read in and return their entities, nil for a missing one.")

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

(def ^:private model-directories
  (merge (zipmap (remove #{:model/Channel} models/data-model) (repeat #{"databases"}))
         (zipmap [:model/Card :model/CardTest :model/Collection :model/Dashboard :model/Document :model/Timeline]
                 (repeat #{"collections"}))
         {:model/Action             #{"actions" "collections"}
          :model/Channel            #{"channels"}
          :model/CustomVizPlugin    #{"custom_viz_plugins"}
          :model/DataApp            #{"data_apps"}
          :model/EmbeddingTheme     #{"embedding_themes"}
          :model/FieldValues        #{"databases"}
          :model/Glossary           #{"glossary"}
          :model/Metabot            #{"metabots"}
          :model/NativeQuerySnippet #{"snippets" "collections"}
          :model/OsiAiContext       #{"osi_ai_context"}
          :model/PythonLibrary      #{"python_libraries" "python-libraries"}
          :model/Transform          #{"transforms" "collections"}
          :model/TransformJob       #{"transforms"}
          :model/TransformTag       #{"transforms"}
          :model/TransformTest      #{"transforms" "collections"}}))

(defn- check-entity! [path model entity]
  (let [metadata (:serdes/meta entity)]
    (when-not (and (map? entity)
                   (not (contains? entity :serdes/stripped))
                   (or (nil? metadata)
                       (and (sequential? metadata)
                            (= (name model) (:model (last metadata)))
                            (every? #(and (map? %) (string? (:model %))
                                          (or (nil? (:id %)) (string? (:id %))))
                                    metadata)))
                   (or (nil? (:entity_id entity)) (string? (:entity_id entity))))
      (serialization/refuse-import! "Invalid serialized entity." {:file path :model model})))
  (doseq [[field child-model] (:children (serialization/spec-of model))
          :let [children (get entity field)]
          :when (some? children)]
    (when-not (sequential? children)
      (serialization/refuse-import! "Invalid nested entities." {:file path :model model :field field}))
    (doseq [child children]
      (check-entity! path child-model child))))

(defn validate-file!
  "Checks the model and structure of a parsed entity file before resolving its identity."
  [allowed-models path entity]
  (let [metadata (:serdes/meta entity)
        model    (when (and (sequential? metadata) (string? (:model (last metadata))))
                   (serialization/model-of entity))]
    (when-not (and (contains? allowed-models model)
                   (contains? (get model-directories model) (first (str/split path #"/" 2))))
      (serialization/refuse-import! "Unsupported import file." {:file path :model model}))
    (check-entity! path model entity)
    entity))

(defn index-file
  "Adds an entity file to the import index, requiring unique identities."
  [index [k file]]
  (when (contains? index k)
    (serialization/refuse-import! "Duplicate import identity." {:key k :file (if (map? file) (:path file) (str file))}))
  (assoc index k file))

(def ^:private archive-models
  (disj (set models/exported-models) :model/Setting))

(defn- ingest-file [file]
  (yaml/from-file file {:key-fn parse-key}))

(defn- read-entity [root-dir file]
  (let [path (str/replace (str (.relativize (.toPath ^File root-dir) (.toPath ^File file))) "\\" "/")]
    (->> (ingest-file file)
         (validate-file! archive-models path)
         read-timestamps
         serialization/restore-identity)))

(defn- check-resource-path!
  "Throws unless `path` is a relative path that stays inside its entity's directory."
  [path]
  (when-not (and (string? path)
                 (not (str/starts-with? path "/"))
                 (not (str/includes? path "\\"))
                 (not-any? #{"" "." ".."} (str/split path #"/" -1)))
    (throw (ex-info (format "Invalid resource file path: %s" path) {:path path}))))

(defn read-resources
  "The ingested `entity` with each of its [[serialization/resource-paths]] read by `read-fn` into `:serdes/resources`."
  [entity read-fn]
  (if-let [paths (seq (serialization/resource-paths entity))]
    (assoc entity :serdes/resources (into {}
                                          (map (fn [path]
                                                 (check-resource-path! path)
                                                 [path (read-fn path)]))
                                          paths))
    entity))

(def legal-top-level-paths
  "Known top-level paths for directory with serialization output.
  We support both \"python-libraries\" and \"python_libraries\" for backwards compatibility. The modern name is \"python_libraries\"."
  #{"actions" "channels" "collections" "custom_viz_plugins" "data_apps" "databases" "embedding_themes" "glossary" "metabots" "python_libraries" "python-libraries" "osi_ai_context" "snippets" "transforms"})

(def shared-top-level-paths
  "The [[legal-top-level-paths]] whose directories also hold files serialization does not own, such as a data app's
  source code, to the name of the entity files in them."
  {"data_apps" "data_app.yaml"})

(def replaced-top-level-paths
  "The [[legal-top-level-paths]] a full export may replace wholesale."
  (apply disj legal-top-level-paths (keys shared-top-level-paths)))

(defn entity-file-path?
  "Whether the `/`-separated relative `path` names an entity YAML file: a `.yaml` file that isn't a dotfile under one
  of the [[legal-top-level-paths]], with the entity file name of its directory when that is one of the
  [[shared-top-level-paths]]."
  [^String path]
  (let [top       (first (str/split path #"/" 2))
        file-name (subs path (inc (or (str/last-index-of path "/") -1)))]
    (boolean (and (str/includes? path "/")
                  (str/ends-with? file-name ".yaml")
                  (not (str/starts-with? file-name "."))
                  (contains? legal-top-level-paths top)
                  (if-let [entity-file-name (get shared-top-level-paths top)]
                    (= entity-file-name file-name)
                    true)))))

(defn- ingestible-file?
  "Whether `file` is a regular file that [[entity-file-path?]] accepts. Dotfiles are excluded (editor temp files, see
  #41567)."
  [^File root-dir ^File file]
  (and (.isFile file)
       (entity-file-path? (str/replace (str (.relativize (.toPath root-dir) (.toPath file))) "\\" "/"))))

(defn- file-key!
  "Parses `file` and returns the `[model ref]` key of its entity, or nil on parse failure, recording the exception in
  the `errors` atom."
  [root-dir ^File file errors]
  (try
    (serialization/key-of (read-entity root-dir file))
    (catch Exception e
      (when (:status-code (ex-data e))
        (throw e))
      (log/warn (u/strip-error e "Error reading file during ingestion"))
      (let [file-name (.getName file)]
        (swap! errors conj (ex-info (format "Failed to parse file: %s" file-name)
                                    {:file file-name} e)))
      nil)))

(defn- ingest-all
  "Returns {:entities {key File}, :errors [Exception...]}.
  Dotfiles are silently skipped (editor temp files, see #41567).
  Non-dotfile YAML parse failures are collected in :errors."
  [^File root-dir]
  (let [errors (atom [])]
    {:entities (reduce index-file {}
                       (for [^File file (file-seq root-dir)
                             :when (ingestible-file? root-dir file)
                             :let [k (file-key! root-dir file errors)]
                             :when k]
                         [k file]))
     :errors   @errors}))

(defn- populate-cache! [cache errors-atom ingest-fn]
  (when-not @cache
    (let [result (ingest-fn)]
      (reset! cache (:entities result))
      (reset! errors-atom (:errors result)))))

(deftype YamlIngestion [^File root-dir settings cache errors-atom]
  Ingestable
  (ingest-list [_]
    (populate-cache! cache errors-atom #(ingest-all root-dir))
    (concat (keys @cache)
            (for [k (keys settings)]
              [:model/Setting (name k)])))

  (ingest-many [_ ks]
    (populate-cache! cache errors-atom #(ingest-all root-dir))
    (mapv (fn [[model id :as k]]
            (if (= model :model/Setting)
              (let [kw-id (keyword id)]
                (when (contains? settings kw-id)
                  {:serdes/meta [{:model "Setting"}] :key id :value (get settings kw-id)}))
              (when-let [file (get @cache k)]
                (try
                  (read-resources (read-entity root-dir file)
                                  (fn [path]
                                    (let [resource (io/file (.getParentFile ^File file) ^String path)]
                                      (when (.isFile resource)
                                        (slurp resource)))))
                  (catch Exception e
                    (throw (ex-info "Unable to ingest file" {:file (.getName ^File file) :key k} e)))))))
          ks))

  (ingest-errors [_]
    (or @errors-atom [])))

(defn ingested
  "An eduction of the `[k entity]` of each of the keys `ks` of `ingestion`, read a batch at a time."
  [ingestion ks]
  (eduction (comp (partition-all serialization/batch-size)
                  (mapcat (fn [batch] (map vector batch (ingest-many ingestion (vec batch))))))
            ks))

(defn ingest-yaml
  "Creates a new Ingestable on a directory of YAML files, as created by
  [[metabase-enterprise.serialization.v2.storage.yaml]]."
  [root-dir]
  (->YamlIngestion (io/file root-dir) (yaml/from-file (io/file root-dir "settings.yaml")) (atom nil) (atom [])))
