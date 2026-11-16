(ns metabase-enterprise.remote-sync.content
  "The synced content of the app DB and of a git tree, each as a map from the `[model ref]` key of an entity to its
  document: `{:path :entity :yaml :resources}`, the path of its YAML file, the entity, the content of its YAML file,
  and the content of its resource files by their path relative to it."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase-enterprise.serialization.core :as ee.serialization]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- child-models
  "The models whose entities export nested in the entities of another model."
  []
  (into #{}
        (mapcat #(vals (:children (serialization/spec-of %))))
        (remote-sync/synced-models)))

(defn exported-models
  "The models whose rows export to files of their own."
  []
  (let [children (child-models)]
    (filterv #(not (children %)) (remote-sync/synced-models))))

(defn- directory
  "The directory of `path`, with its trailing slash."
  [^String path]
  (subs path 0 (inc (or (str/last-index-of path "/") -1))))

(defn- document
  "The document of `entity`, whose YAML file is at `path`."
  [path entity]
  {:path      path
   :entity    entity
   :yaml      (ee.serialization/entity-yaml entity)
   :resources (or (:serdes/resources entity) {})})

(defn same?
  "Whether documents `a` and `b`, either nil when absent, have the same content, wherever their files are."
  [a b]
  (= (some-> a (select-keys [:yaml :resources]))
     (some-> b (select-keys [:yaml :resources]))))

(defn same-documents?
  "Whether `a` and `b`, maps from key to document, have the same entities with the same content."
  [a b]
  (and (= (set (keys a)) (set (keys b)))
       (every? #(same? (get a %) (get b %)) (keys a))))

(defn files
  "The content of the files of `doc` by their path."
  [{:keys [path yaml resources]}]
  (into {path yaml}
        (map (fn [[resource content]] [(str (directory path) resource) content]))
        resources))

(defn- exported
  "The `[row entity]` of each of the synced rows of `model`."
  [model]
  (into []
        (comp (partition-all serialization/batch-size)
              (mapcat (fn [rows]
                        (map (fn [row entity]
                               (when (instance? Exception entity)
                                 (throw entity))
                               [row entity])
                             rows
                             (serialization/export-batch model rows)))))
        (remote-sync.db/synced-rows model)))

(defn local-documents
  "The documents of the synced rows, each with the `:row` `[model pk]` it is exported from."
  []
  (let [namer (ee.serialization/file-namer)]
    (serialization/with-export-transaction
      (into {}
            (mapcat (fn [model]
                      (let [pk      (first (t2/primary-keys model))
                            pairs   (exported model)
                            paths   (ee.serialization/entity-file-paths namer (mapv second pairs))]
                        (map (fn [[row entity] path]
                               [(serialization/key-of entity)
                                (assoc (document path entity) :row [model (get row pk)])])
                             pairs
                             paths))))
            (exported-models)))))

(defn- tree-document
  "The document of the entity YAML file at `path` of the tree of `version` of `repo`, with the content as the tree
  holds it."
  [repo version allowed-models historical? path]
  (let [read-file    #(protocol/read-file repo version %)
        yaml-content (read-file path)
        parsed       (yaml/parse-string yaml-content {:key-fn ee.serialization/parse-key})]
    (when (or (not historical?) (contains? allowed-models (serialization/model-of parsed)))
      (when-not historical?
        (ee.serialization/validate-file! allowed-models path parsed))
      (let [entity (-> parsed
                       ee.serialization/read-timestamps
                       serialization/restore-identity
                       (ee.serialization/read-resources #(read-file (str (directory path) %))))]
        {:path      path
         :entity    entity
         :yaml      yaml-content
         :resources (or (:serdes/resources entity) {})}))))

(defn tree-documents
  "The documents at `version`, rejecting unsupported input unless reading the previous sync base."
  ([repo version] (tree-documents repo version false))
  ([repo version historical?]
   (if version
     (let [allowed-models (set (exported-models))
           documents      (comp (filter ee.serialization/entity-file-path?)
                                (keep #(tree-document repo version allowed-models historical? %))
                                (map (juxt (comp serialization/key-of :entity) identity)))
           paths          (protocol/list-files repo version)]
       (if historical?
         (into {} documents paths)
         (transduce documents (completing ee.serialization/index-file) {} paths)))
     {})))
