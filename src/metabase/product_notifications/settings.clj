(ns metabase.product-notifications.settings
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.product-notifications.core :as product-notifications]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(defsetting product-notifications-info
  (deferred-tru "Cached in-app product notifications feed fetched from the Metabase notifications service.")
  :encryption :no
  :type       :json
  :visibility :internal
  :audit      :never
  :default    {}
  :doc        false
  :export?    false)

(defsetting product-notifications-last-checked
  (deferred-tru "Indicates when Metabase last fetched the in-app product notifications feed.")
  :visibility :internal
  :type       :timestamp
  :audit      :never
  :default    nil
  :doc        false
  :export?    false)

(defsetting dismissed-notification-ids
  (deferred-tru "IDs of in-app product notifications the current user has dismissed.")
  :user-local :only
  :encryption :no
  :export?    false
  :visibility :authenticated
  :type       :json
  :default    []
  :audit      :never)

(defn- current-notification-context
  "Build the per-request context used to decide which notifications are relevant to the current user."
  []
  {:superuser?    (boolean api/*is-superuser?*)
   :hosted?       (premium-features/is-hosted?)
   :edition       (if config/ee-available? "ee" "oss")
   :version       (:tag config/mb-version-info)
   :today         (t/local-date)
   :dismissed-ids (dismissed-notification-ids)})

(defsetting notifications
  (deferred-tru "Relevant, undismissed in-app product notifications for the current user.")
  :visibility :authenticated
  :setter     :none
  :type       :json
  :audit      :never
  :doc        false
  :export?    false
  :getter     (fn []
                (product-notifications/visible-notifications
                 (product-notifications-info)
                 (current-notification-context))))
