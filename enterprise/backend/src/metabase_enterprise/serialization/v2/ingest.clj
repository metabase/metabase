(ns metabase-enterprise.serialization.v2.ingest
  "Ingestion is the first step of an import: reading the export format (eg. a tree of YAML files) into exported
  entities, each named by its `[model ref]` key (see [[metabase.serialization.core/key-of]])."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
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

(defn- ingest-file
  "Reads an entity YAML file and clean it up (eg. parsing timestamps)
  The returned entity is in \"extracted\" form, ready to be passed to the `load` step."
  [file]
  (-> file
      (yaml/from-file {:key-fn parse-key})
      read-timestamps
      serialization/restore-identity))

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
  [^File file errors]
  (try
    (serialization/key-of (ingest-file file))
    (catch Exception e
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
    {:entities (into {} (for [^File file (file-seq root-dir)
                              :when (ingestible-file? root-dir file)
                              :let  [k (file-key! file errors)]
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
                  (read-resources (ingest-file file)
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
