(ns metabase.sample-data.init
  (:require
   [clojure.java.io :as io]
   [metabase.plugins.initialize :as plugins.init]
   [metabase.sample-data.settings]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]))

;; POC: the sample database is now SQLite-backed (was H2). The SQLite driver
;; lives under modules/drivers/sqlite/ and is normally lazy-loaded by the
;; plugin system at startup via Metabase's plugin-scan of the plugins
;; directory. In dev/test the plugin yaml is on the classpath but not
;; auto-discovered, so we register it explicitly here. This makes
;; `:engine :sqlite` (including its `connection-properties`) available before
;; `extract-and-sync-sample-database!` opens a connection.
(defn- ensure-sqlite-driver-registered! []
  (try
    (when-let [yaml-resource (io/resource "metabase/sqlite/metabase-plugin.yaml")]
      (plugins.init/init-plugin-with-info!
       (-> (slurp yaml-resource) yaml/parse-string)))
    (catch Throwable e
      (log/warn e "Failed to eagerly register SQLite driver for sample database"))))

(ensure-sqlite-driver-registered!)
