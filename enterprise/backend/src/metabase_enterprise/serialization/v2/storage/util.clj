(ns metabase-enterprise.serialization.v2.storage.util
  (:require
   [clojure.string :as str]
   [metabase-enterprise.serialization.dump :as dump]
   [metabase.lib.core :as lib]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.string :as u.str]))

(set! *warn-on-reflection* true)

(def ^:private max-label-length 100)
(def ^:private max-label-bytes 200) ;; 255 is a limit in ext4

(defn slugify-name
  "Slugify a name for use as a file or directory name: lowercase, replace special chars with underscores,
  preserve dots and unicode, escape slashes. Truncated for filesystem safety."
  [^String s]
  (when (seq s)
    (-> s
        u/lower-case-en
        (str/replace "\\" "__BACKSLASH__")
        (str/replace "/"  "__SLASH__")
        (str/replace #"[^\p{L}\p{N}_.]" "_")
        (u.str/limit-bytes max-label-bytes)
        (u.str/limit-chars max-label-length))))

(defn- resolve-path
  "Given a storage path (vector of `{:label ... :key ... :style ... :suffix ...}` maps), resolves to a vector of
  strings with deduplication per folder; a `:suffix` is appended after the label is slugified and truncated."
  [unique-name-fns path]
  (loop [remaining    path
         resolved     []]
    (if (empty? remaining)
      resolved
      (let [{:keys [label key style suffix] :or {style :name}} (first remaining)
            slug (str (case style
                        :name (slugify-name label)
                        :slug label)
                      suffix)
            gen  (or (get @unique-name-fns resolved)
                     (let [g (lib/non-truncating-unique-name-generator)]
                       (swap! unique-name-fns assoc resolved g)
                       g))
            unique-name (gen key slug)]
        (recur (rest remaining)
               (conj resolved unique-name))))))

(defn resolve-segments
  "Resolves the storage path `segments` (see [[serdes/storage-path]]) to strings with deduplication per folder, as
  [[default-layout]] does, in storage context `ctx`."
  [ctx segments]
  (resolve-path (:unique-name-fns ctx) segments))

(defn default-layout
  "The layout every export writes unless its context names another: `entity`'s [[serdes/storage-path]] segments in
  storage context `ctx`, slugified and deduplicated per folder in the order of resolution."
  [ctx entity]
  (resolve-path (:unique-name-fns ctx) (serdes/storage-path entity ctx)))

(defn storage-context
  "A storage context (see [[serdes/storage-base-context]]) whose paths come from `layout`, a function of a storage
  context and an extracted entity that returns the entity's resolved path (a vector of strings, the last one the file
  name without its extension), or nil when the entity has no file of its own. `:layout-cache` is an atom a layout may use for
  data it reads once per context. `opts` go into the context: `:table-schema?` (true unless given) says whether a
  file of a table holds the table's schema, and `:extract-opts` are the extraction options of the export."
  ([]
   (storage-context default-layout))
  ([layout]
   (storage-context layout {}))
  ([layout opts]
   (merge (serdes/storage-base-context)
          {:table-schema? true}
          opts
          {:layout       layout
           :layout-cache (atom {})})))

(defn entity-document
  "What the file of the extracted `entity` holds in storage context `ctx`: the entity itself, or the document that
  the context's layout makes of it (a layout names its document function as `:document` in its metadata)."
  [ctx entity]
  (if-let [document (:document (meta (:layout ctx)))]
    (document ctx entity)
    entity))

(defn resolve-storage-path
  "Given ctx and entity, returns a vector of resolved (slugified, deduplicated) path strings, from the ctx's
  `:layout` ([[default-layout]] when it has none). The last element is the filename (without extension). Nil when the
  layout gives the entity no file."
  [ctx entity]
  ((or (:layout ctx) default-layout) ctx entity))

(defn yaml-file-path
  "The `/`-separated path of the YAML file at the `resolved` storage path."
  [resolved]
  (str/join "/" (concat (drop-last resolved) [(str (last resolved) ".yaml")])))

(defn entity-file-path
  "The path, relative to the export root, of the YAML file the extracted `entity` serializes to in storage context
  `ctx`, or nil when the context's layout gives it no file."
  [ctx entity]
  (some-> (resolve-storage-path ctx entity) yaml-file-path))

(defn without-resources
  "The `entity` as written to its YAML file: [[serdes/storable]], without its `:serdes/resources`."
  [entity]
  (serdes/storable (dissoc entity :serdes/resources)))

(defn entity-yaml
  "The text of the YAML file the extracted `entity` serializes to."
  [entity]
  (dump/yaml-content (without-resources entity)))

(defn resource-files
  "Each of `entity`'s `:serdes/resources` as `[path-segments content]`, next to its YAML file at `resolved`."
  [resolved entity]
  (for [[path content] (sort-by key (:serdes/resources entity))]
    [(into (vec (drop-last resolved)) (str/split path #"/")) content]))
