(ns metabase.test.initialize.plugins
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [metabase
             [plugins :as plugins]
             [util :as u]]
            [metabase.plugins.initialize :as plugins.init]
            [metabase.test.data.env.impl :as tx.env.impl]
            [yaml.core :as yaml]))

(defn- driver-plugin-manifest [driver]
  (let [manifest (io/file (format "modules/drivers/%s/resources/metabase-plugin.yaml" (name driver)))]
    (when (.exists manifest)
      (yaml/parse-string (slurp manifest)))))

(defn- driver-parents [driver]
  (let [parents-file (io/file (format "modules/drivers/%s/parents" (name driver)))]
    (when (.exists parents-file)
      (str/split-lines (slurp parents-file)))))

(defn- load-plugin-manifests!
  "When running tests driver plugins aren't loaded the normal way -- instead, to keep things sane, we simply merge their
  dependencies and source paths into the Metabase core project via a custom Leiningen plugin. We still need to run
  appropriate plugin initialization code, however, in order to ensure the drivers do things like register proxy
  drivers or get methods for `connection-properties`.

  Work some magic and find manifest files and load them the way the plugins namespace would have done."
  ([]
   (load-plugin-manifests! (tx.env.impl/get-test-drivers)))

  ([drivers]
   (doseq [driver drivers
           :let   [info (driver-plugin-manifest driver)]
           :when  info]
     (println (u/format-color 'green "Loading plugin manifest for driver as if it were a real plugin: %s" driver))
     (plugins.init/init-plugin-with-info! info)
     ;; ok, now we need to make sure we load any depenencies for those drivers as well (!)
     (load-plugin-manifests! (driver-parents driver)))))

(defn- init! []
  (plugins/load-plugins!)
  (load-plugin-manifests!))
