(ns metabase.public-settings
  (:require (metabase [config :as config]
                      [db :as db])
            (metabase.models [common :as common]
                             [setting :refer [defsetting], :as setting])
            [metabase.setup :as setup]
            [metabase.util.password :as password])
  (:import java.util.TimeZone))

(defsetting check-for-updates
  "Identify when new versions of Metabase are available."
  :type    :boolean
  :default true)

;; TODO - define a JSON type ?
(defsetting version-info
  "Information about available versions of Metabase."
  :type    :json
  :default {})


(defn- short-timezone-name*
  "Get a short display name (e.g. `PST`) for `report-timezone`, or fall back to the System default if it's not set."
  [^String timezone-name]
  (let [^TimeZone timezone (or (when (seq timezone-name)
                                 (TimeZone/getTimeZone timezone-name))
                               (TimeZone/getDefault))]
    (.getDisplayName timezone (.inDaylightTime timezone (java.util.Date.)) TimeZone/SHORT)))

(def ^:private short-timezone-name (memoize short-timezone-name*))


(defn public-settings
  "Return a simple map of key/value pairs which represent the public settings for the front-end application."
  []
  {:ga_code               "UA-60817802-1"
   :password_complexity   password/active-password-complexity
   :timezones             common/timezones
   :version               config/mb-version-info
   :engines               ((resolve 'metabase.driver/available-drivers))
   :setup_token           (setup/token-value)
   :anon_tracking_enabled (setting/get :anon-tracking-enabled)
   :site_name             (setting/get :site-name)
   :email_configured      ((resolve 'metabase.email/email-configured?))
   :admin_email           (setting/get :admin-email)
   :report_timezone       (setting/get :report-timezone)
   :timezone_short        (short-timezone-name (setting/get :report-timezone))
   :has_sample_dataset    (db/exists? 'Database, :is_sample true)
   :google_auth_client_id (setting/get :google-auth-client-id)})
