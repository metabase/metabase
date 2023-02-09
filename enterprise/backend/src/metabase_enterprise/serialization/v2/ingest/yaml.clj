(ns metabase-enterprise.serialization.v2.ingest.yaml
  "Note that throughout the YAML file handling, the `:serdes/meta` abstract path is referred to as the \"hierarchy\",
  to avoid confusion with filesystem paths."
  (:require
   [clojure.java.io :as io]
   [medley.core :as m]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase-enterprise.serialization.v2.utils.yaml :as u.yaml]
   [metabase.util.date-2 :as u.date]
   [yaml.core :as yaml]
   [yaml.reader :as y.reader])
  (:import
   (java.io File)
   (java.time.temporal Temporal)))

(extend-type Temporal y.reader/YAMLReader
  (decode [data]
    (u.date/parse data)))

(defn- build-settings [file]
  (let [settings (yaml/from-file file)]
    (for [[k _] settings]
      ; We return a path of 1 item, the setting itself.
      [{:model "Setting" :id (name k)}])))

(defn- build-metas [^File root-dir ^File file]
  (let [path-parts (u.yaml/path-split root-dir file)]
    (if (= ["settings.yaml"] path-parts)
      (build-settings file)
      [(u.yaml/path->hierarchy path-parts)])))

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
  ingest/Ingestable
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
