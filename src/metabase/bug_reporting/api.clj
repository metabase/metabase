(ns metabase.bug-reporting.api
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api.common.validation :as validation]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.system-info :as u.system-info]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- metabase-info
  "Make it easy for the user to tell us what they're using"
  []
  (merge
   {:databases            (t2/select-fn-set :engine :model/Database)
    :run-mode             (config/config-kw :mb-run-mode)
    :plan-alias           (or (premium-features/plan-alias) "")
    :version              config/mb-version-info
    :settings             {:report-timezone (driver/report-timezone)}
    :hosting-env          (analytics/environment-type)
    :application-database (mdb/db-type)}
   (when-not (premium-features/is-hosted?)
     {:application-database-details (t2/with-connection [^java.sql.Connection conn]
                                      (let [metadata (.getMetaData conn)]
                                        {:database    {:name    (.getDatabaseProductName metadata)
                                                       :version (.getDatabaseProductVersion metadata)}
                                         :jdbc-driver {:name    (.getDriverName metadata)
                                                       :version (.getDriverVersion metadata)}}))})
   (when (premium-features/airgap-enabled)
     {:airgap-token       :enabled
      :max-users          (premium-features/max-users-allowed)
      :current-user-count (premium-features/active-users-count)
      :valid-thru         (:valid-thru (premium-features/token-status))})))

(api.macros/defendpoint :get "/details"
  "Returns version and system information relevant to filing a bug report against Metabase."
  []
  (validation/check-has-application-permission :monitoring)
  (cond-> {:metabase-info (metabase-info)}
    (not (premium-features/is-hosted?))
    (assoc :system-info (u.system-info/system-info))))
