(ns metabase.troubleshooting
  (:require [clojure.java.jdbc :as jdbc]
            [metabase
             [config :as mc]
             [db :as mdb]]
            [metabase.models.setting :as setting]
            [metabase.util.stats :as mus]
            [toucan.db :as db]))

(defn system-info
  "System info we ask for for bug reports"
  []
  (into (sorted-map)
        (select-keys (System/getProperties) ["java.runtime.name"
                                             "java.runtime.version"
                                             "java.vendor"
                                             "java.vendor.url"
                                             "java.version"
                                             "java.vm.name"
                                             "java.vm.version"
                                             "os.name"
                                             "os.version"
                                             "user.language"
                                             "user.timezone"
                                             "file.encoding"])))

(defn metabase-info
  "Make it easy for the user to tell us what they're using"
  []
  {:databases                    (->> (db/select 'Database) (map :engine) distinct)
   :hosting-env                  (mus/environment-type)
   :application-database         (mdb/db-type)
   :application-database-details (jdbc/with-db-metadata [metadata (db/connection)]
                                   {:database    {:name    (.getDatabaseProductName metadata)
                                                  :version (.getDatabaseProductVersion metadata)}
                                    :jdbc-driver {:name    (.getDriverName metadata)
                                                  :version (.getDriverVersion metadata)}})
   :run-mode                     (mc/config-kw :mb-run-mode)
   :version                      mc/mb-version-info
   :settings                     {:report-timezone (setting/get :report-timezone)}})
