(ns metabase.permissions.validation
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru]]))

(defn check-has-application-permission
  "If `advanced-permissions` is enabled, check `*current-user*` has application permission of type `perm-type`.
  Set `require-superuser?` to `true` to perform a superuser check when `advanced-permissions` is disabled."
  ([perm-type]
   (check-has-application-permission perm-type true))

  ([perm-type require-superuser?]
   (if-let [f (and (premium-features/enable-advanced-permissions?)
                   config/ee-available?
                   (requiring-resolve 'metabase-enterprise.advanced-permissions.common/current-user-has-application-permissions?))]
     (api/check-403 (f perm-type))
     (when require-superuser?
       (api/check-superuser)))))

(defn check-advanced-permissions-enabled
  "Check if advanced permissions is enabled to use permission types such as :group-manager or :application-permissions."
  [perm-type]
  (api/check (premium-features/enable-advanced-permissions?)
             [402 (tru "The {0} permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
                       (str/replace (name perm-type) "-" " "))]))

(defn check-group-manager
  "If `advanced-permissions` is enabled, check is `*current-user*` a manager of at least one group.
   Set `require-superuser?` to `false` to disable superuser checks if `advanced-permissions` is not enabled."
  ([]
   (check-group-manager true))

  ([require-superuser?]
   (if (premium-features/enable-advanced-permissions?)
     (api/check-403 (or api/*is-superuser?* api/*is-group-manager?*))
     (when require-superuser?
       (api/check-superuser)))))

(defn check-manager-of-group
  "If `advanced-permissions` is enabled, check is `*current-user*` is manager of `group-or-id`.
  Set `require-superuser?` to `false` to disable superuser checks if `advanced-permissions` is not enabled."
  ([group-or-id]
   (check-manager-of-group group-or-id true))

  ([group-or-id require-superuser?]
   (if-let [f (and (premium-features/enable-advanced-permissions?)
                   config/ee-available?
                   (requiring-resolve 'metabase-enterprise.advanced-permissions.common/current-user-is-manager-of-group?))]
     (api/check-403 (or api/*is-superuser?* (f group-or-id)))
     (when require-superuser?
       (api/check-superuser)))))
