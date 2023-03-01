(ns metabase-enterprise.serialization.v2.storage.yaml
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.serialization.dump :as v1]
   [metabase-enterprise.serialization.v2.utils.yaml :as u.yaml]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [yaml.writer :as y.writer]) 
  (:import [java.time.temporal Temporal]))

(extend-type Temporal y.writer/YAMLWriter
             (encode [data]
               (u.date/format data)))

(defn store!
  "Serializes stream of entities to directory as YAML."
  [stream root-dir & {:keys [abort-on-error]}]
  ;; settings are saved after processing all other entities
  (let [settings (atom [])
        ctx      (serdes.base/storage-base-context)]
    (doseq [{hierarchy :serdes/meta :as entity} stream
            :let [log-path-str (u.yaml/log-path-str hierarchy)]]
      (try
        (if (-> hierarchy last :model (= "Setting"))
          (swap! settings conj entity)
          (let [components   (map u.yaml/escape-segment (serdes.base/storage-path entity ctx))
                base         (apply io/file root-dir components)
                storage-path (str base ".yaml")]
            (log/info (trs "Storing {0}" log-path-str))
            (v1/spit-yaml storage-path (dissoc entity :serdes/meta))))
        (catch Exception e
          (if abort-on-error
            (throw e)
            (log/error e (trs "Error encountered while exporting {0}" log-path-str))))))
    (v1/spit-yaml (io/file root-dir "settings.yaml")
                  (into (sorted-map) (map (juxt :key :value) @settings)))))
