(ns metabase.api.actions
  "`/api/actions/` endpoints."
  (:require [compojure.core :refer [GET]]
            [metabase.actions :as actions]
            [metabase.api.common :as api]
            [metabase.util.i18n :as i18n]))

(api/defendpoint GET "/dummy"
  "Dummy API endpoint to test feature flagging with the [[metabase.actions/experimental-enable-actions]] feature flag.
  We can remove this and test other endpoints once we have other endpoints."
  []
  {:dummy true})

(defn- +check-actions-enabled
  "Ring middleware that checks that the [[metabase.actions/experimental-enable-actions]] feature flag is enabled, and
  returns a 403 Unauthorized response "
  [handler]
  (fn [request respond raise]
    (if (actions/experimental-enable-actions)
      (handler request respond raise)
      (raise (ex-info (i18n/tru "Actions are not enabled.")
                      {:status-code 400})))))

(api/define-routes +check-actions-enabled)
