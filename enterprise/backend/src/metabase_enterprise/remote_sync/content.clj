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
  "The models whose rows synced under `ctx` export to files of their own."
  [ctx]
  (let [children (child-models)]
    (filterv #(and (not (children %)) (remote-sync/synced-where % :row ctx))
             (remote-sync/synced-models))))

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
  "The `[row entity]` of each of the synced rows of `model` under `ctx`."
  [model ctx]
  (into []
        (comp (partition-all serialization/batch-size)
              (mapcat (fn [rows]
                        (map (fn [row entity]
                               (when (instance? Exception entity)
                                 (throw entity))
                               [row entity])
                             rows
                             (serialization/export-batch model rows)))))
        (remote-sync.db/rows-in model (remote-sync/synced-ids model ctx))))

(defn local-documents
  "The documents of the rows synced under `ctx`, each with the `:row` `[model pk]` it is exported from."
  [ctx]
  (let [namer (ee.serialization/file-namer)]
    (serialization/with-export-transaction
      (into {}
            (mapcat (fn [model]
                      (let [pk      (first (t2/primary-keys model))
                            pairs   (exported model ctx)
                            paths   (ee.serialization/entity-file-paths namer (mapv second pairs))]
                        (map (fn [[row entity] path]
                               [(serialization/key-of entity)
                                (assoc (document path entity) :row [model (get row pk)])])
                             pairs
                             paths))))
            (exported-models ctx)))))

(defn local-contents
  "The `{:yaml :resources}` the rows of the app DB export to for each of `docs`, a map from key to document, leaving out
  the documents with no row."
  [docs]
  (into {}
        (mapcat (fn [[model pairs]]
                  (let [ks       (mapv key pairs)
                        rows     (serialization/local-rows model (mapv (comp :entity val) pairs))
                        found    (into [] (filter second) (map vector ks rows))
                        entities (serialization/export-batch model (mapv second found))]
                    (keep (fn [[[k] entity]]
                            (when-not (instance? Exception entity)
                              [k (select-keys (document (:path (get docs k)) entity) [:yaml :resources])]))
                          (map vector found entities)))))
        (group-by (comp first key) docs)))

(defn- tree-document
  "The document of the entity YAML file at `path` of the tree of `version` of `repo`, with the content as the tree
  holds it."
  [repo version path]
  (let [read-file    #(protocol/read-file repo version %)
        yaml-content (read-file path)
        entity       (-> yaml-content
                         (yaml/parse-string {:key-fn ee.serialization/parse-key})
                         ee.serialization/read-timestamps
                         serialization/restore-identity
                         (ee.serialization/read-resources #(read-file (str (directory path) %))))]
    {:path      path
     :entity    entity
     :yaml      yaml-content
     :resources (or (:serdes/resources entity) {})}))

(defn tree-documents
  "The documents of the entity YAML files of the tree of `version` of `repo`, of the models synced under `ctx`; none
  for a nil `version`."
  [ctx repo version]
  (let [synced? (set (exported-models ctx))]
    (if version
      (into {}
            (comp (filter ee.serialization/entity-file-path?)
                  (map #(tree-document repo version %))
                  (map (juxt (comp serialization/key-of :entity) identity))
                  (filter (comp synced? ffirst)))
            (protocol/list-files repo version))
      {})))
