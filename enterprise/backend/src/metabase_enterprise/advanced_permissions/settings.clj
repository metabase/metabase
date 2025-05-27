(ns metabase-enterprise.advanced-permissions.settings
  (:require
   [metabase-enterprise.advanced-permissions.common :as advanced-permissions.common]
   [metabase.api.common :as api]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as settings]))

(defn- has-advanced-setting-access?
  "If `advanced-permissions` is enabled, check if current user has permissions to edit `setting`.
  Return `false` for all non-admins when `advanced-permissions` is disabled. Return `true` for all admins."
  [_setting]
  (or api/*is-superuser?*
      (and (premium-features/has-feature? :advanced-permissions)
           (advanced-permissions.common/current-user-has-application-permissions? :setting))))

(settings/register-current-user-settings-access-fn! ::has-advanced-setting-access? #'has-advanced-setting-access?)
