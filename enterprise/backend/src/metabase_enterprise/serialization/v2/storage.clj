(ns metabase-enterprise.serialization.v2.storage
  (:require [clojure.java.io :as io]
            [metabase-enterprise.serialization.dump :refer [spit-yaml]]
            [metabase-enterprise.serialization.v2.utils.yaml :as u.yaml]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.util.i18n :refer [trs]]
            [metabase.util.log :as log]))

(defn- store-entity! [opts entity]
  (log/info (trs "Storing {0}" (u.yaml/log-path-str (:serdes/meta entity))))
  (spit-yaml (u.yaml/hierarchy->file opts entity)
             (dissoc entity :serdes/meta)))

(defn- store-settings! [{:keys [root-dir]} settings]
  (let [as-map (into (sorted-map)
                     (for [{:keys [key value]} settings]
                       [key value]))]
    (spit-yaml (io/file root-dir "settings.yaml") as-map)))

(defn store!
  "Helper for storing a serialized database to a tree of YAML files."
  [stream root-dir]
  (let [settings (atom [])
        opts     (merge {:root-dir root-dir} (serdes.base/storage-base-context))]
    (doseq [entity stream]
      (if (-> entity :serdes/meta last :model (= "Setting"))
        (swap! settings conj entity)
        (store-entity! opts entity)))
    (store-settings! opts @settings)))
