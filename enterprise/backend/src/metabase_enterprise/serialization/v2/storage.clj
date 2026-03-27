(ns metabase-enterprise.serialization.v2.storage
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.dump :refer [spit-yaml!]]
   [metabase.lib.util.unique-name-generator :as unique-name-generator]
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

(defn escape-segment
  "Given a path segment, which is supposed to be the name of a single file or directory, escape any slashes inside it.
  This occurs in practice, for example with a `Field.name` containing a slash like \"Company/organization website\"."
  [segment]
  (-> segment
      (str/replace "/"  "__SLASH__")
      (str/replace "\\" "__BACKSLASH__")))

(defn- slugify-name
  "Slugify a name for use as a file or directory name: lowercase, underscores, truncated for filesystem safety."
  [^String s]
  (-> (u/slugify s {:unicode? true})
      (u.str/limit-bytes max-label-bytes)
      (u.str/limit-chars max-label-length)))

(defn- resolve-path
  "Given a storage path (vector of `{:label ... :key ...}` maps), resolves to a vector of strings
  with deduplication per folder. Uses `generators` atom `{parent-key -> unique-name-generator}`."
  [generators path]
  (loop [remaining  path
         parent-key nil
         resolved   []]
    (if (empty? remaining)
      resolved
      (let [{:keys [label key]} (first remaining)
            slug (slugify-name label)
            gen  (or (get @generators parent-key)
                     (let [g (unique-name-generator/non-truncating-unique-name-generator)]
                       (swap! generators assoc parent-key g)
                       g))
            unique-name (gen key slug)]
        (recur (rest remaining)
               key
               (conj resolved unique-name))))))

(defn- file ^File [ctx entity]
  (let [base-path   (serdes/storage-path entity ctx)
        resolved    (resolve-path (:generators ctx) base-path)
        dirnames    (drop-last resolved)
        basename    (str (last resolved) ".yaml")]
    (apply io/file (:root-dir ctx) (map escape-segment (concat dirnames [basename])))))

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
                     (assoc :root-dir root-dir)
                     (assoc :generators (atom {})))]
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
