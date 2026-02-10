(ns metabase-enterprise.serialization.v2.storage
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.dump :refer [spit-yaml!]]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log])
  (:import
   [java.io File]
   [java.nio.file Path]))

(set! *warn-on-reflection* true)

(defn escape-segment
  "Given a path segment, which is supposed to be the name of a single file or directory, escape any slashes inside it.
  This occurs in practice, for example with a `Field.name` containing a slash like \"Company/organization website\"."
  [segment]
  (-> segment
      (str/replace "/"  "__SLASH__")
      (str/replace "\\" "__BACKSLASH__")))

(defn- file ^File [ctx entity]
  (let [;; Get the desired [[serdes/storage-path]].
        base-path   (serdes/storage-path entity ctx)
        dirnames    (drop-last base-path)
        ;; Attach the file extension to the last part.
        basename    (str (last base-path) ".yaml")]
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
                     (assoc :root-dir root-dir))]
    (doseq [entity stream]
      (when (Thread/interrupted)
        (throw (InterruptedException. "Serialization export interrupted")))
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
