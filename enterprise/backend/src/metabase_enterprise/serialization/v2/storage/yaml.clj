(ns metabase-enterprise.serialization.v2.storage.yaml
  (:require [clojure.java.io :as io]
            [metabase-enterprise.serialization.v2.storage :as storage]
            [yaml.core :as yaml]
            [yaml.writer :as y.writer]))

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

(defmethod storage/store-all! :yaml [stream opts]
  (when-not (or (string? (:root-dir opts))
                (instance? java.io.File (:root-dir opts)))
    (throw (ex-info ":yaml storage requires the :root-dir option to be a string or File"
                    {:opts opts})))
  (doseq [entity stream]
    (store-entity! opts entity)))

(comment
  (storage/store-all! (metabase-enterprise.serialization.v2.extract/extract-metabase {})
                      {:storage/target :yaml
                       :root-dir "/home/braden/mb/metabase/dump"}))
