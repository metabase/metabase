(ns metabase.troubleshooting
  (:require [metabase
             [config :as mc]
             [db :as mdb]]
            [metabase.models.setting :as setting]
            [metabase.util.stats :as mus]
            [toucan.db :as tdb]))

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
                                             "user.timezone"])))

(defn metabase-info
  "Make it easy for the user to tell us what they're using"
  []
  {:databases            (->> (tdb/select 'Database) (map :engine) distinct)
   :hosting-env          (mus/environment-type)
   :application-database (mdb/db-type)
   :run-mode             (mc/config-kw :mb-run-mode)
   :version              mc/mb-version-info
   :settings             {:report-timezone (setting/get :report-timezone)}})
