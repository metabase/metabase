(ns metabase-enterprise.serialization.v2.storage
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.dump :refer [spit-yaml!]]
   [metabase.lib.core :as lib]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str])
  (:import
   [java.io File]
   [java.nio.file Path]))

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
  with deduplication per folder. Uses `unique-name-fns` atom `{resolved-parent-path -> unique-name-fn}` where
  each fn is a `lib/non-truncating-unique-name-generator`.
  Keyed on the full resolved parent path to avoid cross-contamination between unrelated directories
  (e.g. `collections/transforms/` vs `databases/.../schemas/transforms/`)."
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

(defn- file ^File [ctx entity]
  (let [resolved    (resolve-storage-path ctx entity)
        dirnames    (drop-last resolved)
        basename    (str (last resolved) ".yaml")]
    (apply io/file (:root-dir ctx) (concat dirnames [basename]))))

(defn- store-entity! [opts entity]
  (let [f (file opts entity)]
    (log/info "Storing" {:path (serdes/log-path-str (:serdes/meta entity))
                         :file (str (.relativize (Path/of (str (:root-dir opts)) (make-array String 0))
                                                 (.toPath f)))})
    (spit-yaml! f entity)
    (:serdes/meta entity)))

(defn- store-settings! [{:keys [root-dir]} settings]
  (when (seq settings)
    (let [as-map (into (sorted-map)
                       (for [{:keys [key value]} settings]
                         [key value]))]
      (spit-yaml! (io/file root-dir "settings.yaml") as-map))))

(defn store!
  "Helper for storing a serialized database to a tree of YAML files."
  [stream root-dir]
  (let [settings (atom [])
        report   (atom {:seen [] :errors []})
        opts     (-> (serdes/storage-base-context)
                     (assoc :root-dir root-dir))]
    (doseq [entity stream]
      (cond
        (instance? Exception entity)
        (swap! report update :errors conj entity)

        (-> entity :serdes/meta last :model (= "Setting"))
        (swap! settings conj entity)

        :else
        (swap! report update :seen conj (store-entity! opts entity))))
    (when (seq @settings)
      (store-settings! opts @settings)
      (swap! report update :seen conj [{:model "Setting"}]))
    @report))
