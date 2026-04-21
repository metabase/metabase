(ns metabase-enterprise.serialization.v2.storage.util
  (:require
   [clojure.string :as str]
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
  "Given a storage path (vector of `{:label ... :key ...}` maps), resolves to a vector of strings
  with deduplication per folder."
  [unique-name-fns path]
  (loop [remaining    path
         resolved     []]
    (if (empty? remaining)
      resolved
      (let [{:keys [label key]} (first remaining)
            slug (slugify-name label)
            gen  (or (get @unique-name-fns resolved)
                     (let [g (lib/non-truncating-unique-name-generator)]
                       (swap! unique-name-fns assoc resolved g)
                       g))
            unique-name (gen key slug)]
        (recur (rest remaining)
               (conj resolved unique-name))))))

(defn resolve-storage-path
  "Given ctx and entity, returns a vector of resolved (slugified, deduplicated) path strings.
  The last element is the filename (without extension)."
  [ctx entity]
  (resolve-path (:unique-name-fns ctx) (serdes/storage-path entity ctx)))
