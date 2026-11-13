(ns metabase-enterprise.serialization.v2.storage.util
  (:require
   [clojure.string :as str]
   [metabase-enterprise.serialization.dump :as dump]
   [metabase.lib.core :as lib]
   [metabase.serialization.core :as serialization]
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

(defn file-namer
  "A new namer of exported files: the state that keeps the names of the files an export writes to one folder
  unique, for [[resolve-storage-paths]]."
  []
  (atom {}))

(defn resolve-storage-paths
  "The resolved (slugified, deduplicated) storage path of each of `entities`, as a vector of strings whose last element
  is the file name without extension, with the names `namer` (see [[file-namer]]) has given out."
  [namer entities]
  (mapv #(resolve-path namer %) (serialization/batch-storage-paths entities)))

(defn yaml-file-path
  "The `/`-separated path of the YAML file at the `resolved` storage path."
  [resolved]
  (str/join "/" (concat (drop-last resolved) [(str (last resolved) ".yaml")])))

(defn entity-file-paths
  "The path, relative to the export root, of the YAML file each of `entities` serializes to, with the names `namer`
  (see [[file-namer]]) has given out."
  [namer entities]
  (mapv yaml-file-path (resolve-storage-paths namer entities)))

(defn entity-file-path
  "The path, relative to the export root, of the YAML file `entity` serializes to, with the names `namer` (see
  [[file-namer]]) has given out."
  [namer entity]
  (first (entity-file-paths namer [entity])))

(defn without-resources
  "The `entity` as written to its YAML file: [[serialization/storable]], without its `:serdes/resources`."
  [entity]
  (serialization/storable (dissoc entity :serdes/resources)))

(defn entity-yaml
  "The text of the YAML file the extracted `entity` serializes to."
  [entity]
  (dump/yaml-content (without-resources entity)))

(defn resource-files
  "Each of `entity`'s `:serdes/resources` as `[path-segments content]`, next to its YAML file at `resolved`."
  [resolved entity]
  (for [[path content] (sort-by key (:serdes/resources entity))]
    [(into (vec (drop-last resolved)) (str/split path #"/")) content]))
