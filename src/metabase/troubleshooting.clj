(ns metabase.troubleshooting
  (:require
   [metabase.analytics.stats :as stats]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.driver :as driver]
   [metabase.public-settings.premium-features :as premium-features]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn system-info
  "System info we ask for for bug reports"
  []
  (->> (select-keys (System/getProperties)
                    (concat
                     (when-not (premium-features/is-hosted?)
                       ["os.name"
                        "os.version"])
                     ["file.encoding"
                      "java.runtime.name"
                      "java.runtime.version"
                      "java.vendor"
                      "java.vendor.url"
                      "java.version"
                      "java.vm.name"
                      "java.vm.version"
                      "user.language"
                      "user.timezone"]))
       (into (sorted-map))))

(defn metabase-info
  "Make it easy for the user to tell us what they're using"
  []
  (merge
   {:databases  (->> (t2/select :model/Database) (map :engine) distinct)
    :run-mode   (config/config-kw :mb-run-mode)
    :plan-alias (or (some-> (premium-features/premium-embedding-token) premium-features/fetch-token-status :plan-alias) "")
    :version    config/mb-version-info
    :settings   {:report-timezone (driver/report-timezone)}}
   (when-not (premium-features/is-hosted?)
     {:hosting-env                  (stats/environment-type)
      :application-database         (mdb/db-type)
      :application-database-details (t2/with-connection [^java.sql.Connection conn]
                                      (let [metadata (.getMetaData conn)]
                                        {:database    {:name    (.getDatabaseProductName metadata)
                                                       :version (.getDatabaseProductVersion metadata)}
                                         :jdbc-driver {:name    (.getDriverName metadata)
                                                       :version (.getDriverVersion metadata)}}))})
   (when (premium-features/is-airgapped?)
     {:airgap-token       :enabled
      :max-users          (premium-features/max-users-allowed)
      :current-user-count (premium-features/cached-active-users-count)
      :valid-thru         (some-> (premium-features/premium-embedding-token) premium-features/fetch-token-status :valid-thru)})))
