(ns metabase-enterprise.serialization.v2.storage
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [metabase-enterprise.serialization.dump :refer [spit-yaml]]
            [metabase.models.serialization :as serdes]
            [metabase.util.i18n :refer [trs]]
            [metabase.util.log :as log]))

(defn- escape-segment
  "Given a path segment, which is supposed to be the name of a single file or directory, escape any slashes inside it.
  This occurs in practice, for example with a `Field.name` containing a slash like \"Company/organization website\"."
  [segment]
  (-> segment
      (str/replace "/"  "__SLASH__")
      (str/replace "\\" "__BACKSLASH__")))

(defn- file
  [ctx entity]
  (let [;; Get the desired [[serdes/storage-path]].
        base-path   (serdes/storage-path entity ctx)
        dirnames    (drop-last base-path)
        ;; Attach the file extension to the last part.
        basename    (str (last base-path) ".yaml")]
    (apply io/file (:root-dir ctx) (map escape-segment (concat dirnames [basename])))))

(defn- store-entity! [opts entity]
  (log/info (trs "Storing {0}" (serdes/log-path-str (:serdes/meta entity))))
  (spit-yaml (file opts entity) entity))

(defn- store-settings! [{:keys [root-dir]} settings]
  (let [as-map (into (sorted-map)
                     (for [{:keys [key value]} settings]
                       [key value]))]
    (spit-yaml (io/file root-dir "settings.yaml") as-map)))

(defn store!
  "Helper for storing a serialized database to a tree of YAML files."
  [stream root-dir]
  (let [settings (atom [])
        opts     (merge {:root-dir root-dir} (serdes/storage-base-context))]
    (doseq [entity stream]
      (if (-> entity :serdes/meta last :model (= "Setting"))
        (swap! settings conj entity)
        (store-entity! opts entity)))
    (store-settings! opts @settings)))
