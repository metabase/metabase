(ns metabase.test.initialize.plugins
  (:require
   [clojure.java.io :as io]
   [clojure.tools.reader.edn :as edn]
   [metabase.plugins :as plugins]
   [metabase.plugins.initialize :as plugins.init]
   [metabase.test.data.env.impl :as tx.env.impl]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

;; [[metabase.plugins/load-local-plugin-manifests!]] actually does the same thing as the code below now; the only
;; difference is this code also initializes plugins in `test_modules`. Besides that this code isn't needed
(defn- driver-plugin-manifest [driver]
  (let [nm    (name driver)
        paths (mapv
               #(format "%s/drivers/%s/resources/metabase-plugin.yaml" % nm)
               ;; look for driver definition in both the regular modules directory, as well as in a top-level
               ;; test_modules directory, specifically designed for test driver definitions
               ["modules" "test_modules"])]
    (first (filter some?
                   (for [path paths
                         :let [manifest (io/file path)]
                         :when (.exists manifest)]
                     (do
                       (log/info (u/format-color
                                  'green
                                  "Loading plugin manifest (from %s) for driver as if it were a real plugin: %s"
                                  path
                                  nm))
                       (yaml/parse-string (slurp manifest))))))))

(defn- driver-parents
  "Return the set of parents for `driver`. Based on the value of `:metabase.driver/parents` in its `deps.edn`
  file."
  [driver]
  (let [driver-deps-edn-file (io/file (format "modules/drivers/%s/deps.edn" (name driver)))]
    (when (.exists driver-deps-edn-file)
      (let [edn (edn/read-string (slurp driver-deps-edn-file))]
        (:metabase.driver/parents edn)))))

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
     (plugins.init/init-plugin-with-info! info)
     ;; ok, now we need to make sure we load any depenencies for those drivers as well (!)
     (load-plugin-manifests! (driver-parents driver)))))

(defn init! []
  (plugins/load-plugins!)
  (load-plugin-manifests!))

(defn init-test-drivers!
  "Explicitly initialize the given test `drivers` via plugin manifests. These manifests can live in test_modules (having
  the same directory structure as modules), but test_modules will not be built or shipped as part of the core product."
  {:added "0.41.0"}
  [drivers]
  (load-plugin-manifests! drivers))
