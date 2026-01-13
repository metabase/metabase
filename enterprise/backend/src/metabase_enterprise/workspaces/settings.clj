(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.i18n :as i18n :refer [deferred-tru tru]]))

(def ^:private permissions-not-verified-reason
  {:key     :workspace/permissions-not-verified
   :type    :error
   :message (deferred-tru "Workspace permissions have not been verified. Run the permission check first.")})

(defn- permissions-failed-reason [error]
  {:key     :workspace/permissions-check-failed
   :type    :error
   :message (or error (tru "Workspace permission check failed."))})

;; Cache for permission check results
;; Value shape: {:status "ok"|"failed", :error "...", :checked_at "..."}
(setting/defsetting workspace-permissions-cache
  (deferred-tru "Cache for workspace isolation permission check results.")
  :type           :json
  :default        nil
  :visibility     :internal
  :database-local :only
  :export?        false)

;; Enabled flag
(setting/defsetting workspaces-enabled
  (deferred-tru "Whether workspaces are enabled for this database.")
  :default          false
  :driver-feature   :workspace
  :type             :boolean
  :visibility       :public
  :database-local   :only
  :export?          true
  :enabled-for-db?  (fn [db]
                      (let [cache (get-in db [:settings :workspace-permissions-cache])]
                        (setting/custom-disabled-reasons!
                         [(cond
                            (nil? cache)
                            permissions-not-verified-reason

                            (not= "ok" (:status cache))
                            (permissions-failed-reason (:error cache)))]))))
