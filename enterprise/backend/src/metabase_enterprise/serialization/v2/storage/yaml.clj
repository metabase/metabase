(ns metabase-enterprise.serialization.v2.storage.yaml
  (:require [clojure.java.io :as io]
            [metabase-enterprise.serialization.v2.storage :as storage]
            [yaml.core :as yaml]))

(defn- spit-yaml
  [path obj]
  (apply io/make-parents path)
  (spit (apply io/file path) (yaml/generate-string obj :dumper-options {:flow-style :block})))

(defn- store-entity! [{:keys [root-dir]} {{:keys [id type label]} :serdes/meta :as entity}]
  (let [basename (if (nil? label)
                   (str id ".yaml")
                   ; + is a legal, unescaped character on all common filesystems, but not `identity-hash` or NanoID!
                   (str id "+" label ".yaml"))
        path [root-dir type basename]]
    (spit-yaml path (dissoc entity :serdes/meta))))

(defn- store-settings! [{:keys [root-dir]} settings]
  (let [as-map (into (sorted-map)
                     (for [{:keys [key value]} settings]
                       [key value]))]
    (spit-yaml [root-dir "settings.yaml"] as-map)))

(defmethod storage/store-all! :yaml [stream opts]
  (when-not (or (string? (:root-dir opts))
                (instance? java.io.File (:root-dir opts)))
    (throw (ex-info ":yaml storage requires the :root-dir option to be a string or File"
                    {:opts opts})))
  (let [settings (atom [])]
    (doseq [entity stream]
      (if (-> entity :serdes/meta :type (= "Setting"))
        (swap! settings conj entity)
        (store-entity! opts entity)))
    (store-settings! opts @settings)))

(comment
  (storage/store-all! (metabase-enterprise.serialization.v2.extract/extract-metabase {})
                      {:storage/target :yaml
                       :root-dir "/home/braden/mb/metabase/dump"}))

(defn store!
  "Helper for storing a serialized database to a tree of YAML files."
  [stream root-dir]
  (storage/store-all! stream {:storage/target :yaml
                              :root-dir       root-dir}))
