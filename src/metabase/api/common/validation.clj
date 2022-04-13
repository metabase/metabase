(ns metabase.api.common.validation
  (:require [metabase.api.common :as api]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util :as u]
            [metabase.util.i18n :as ui18n :refer [tru]]))

;; TODO: figure out what other functions to move here from metabase.api.common

(defn check-public-sharing-enabled
  "Check that the `public-sharing-enabled` Setting is `true`, or throw a `400`."
  []
  (api/check (public-settings/enable-public-sharing)
             [400 (tru "Public sharing is not enabled.")]))

(defn check-embedding-enabled
  "Is embedding of Cards or Objects (secured access via `/api/embed` endpoints with a signed JWT enabled?"
  []
  (api/check (public-settings/enable-embedding)
             [400 (tru "Embedding is not enabled.")]))

(defn check-has-general-permission
  "If `advanced-permissions` is enabled, check `*current-user*` has general permission of type `perm-type`.
  Set `require-superuser?` to `true` to perform a superuser check when `advanced-permissions` is disabled."
  ([perm-type]
   (check-has-general-permission perm-type true))

  ([perm-type require-superuser?]
   (if-let [f (and (premium-features/enable-advanced-permissions?)
                   (resolve 'metabase-enterprise.advanced-permissions.common/current-user-has-general-permissions?))]
     (api/check-403 (f perm-type))
     (when require-superuser?
       (api/check-superuser)))))

(defn check-group-manager
   "If `advanced-permissions` is enabled, check is `*current-user*` a group manager.
   Set `require-superuser?` to `false` to disable superuser checks if `advanced-permissions` is not enabled.

   By default it's check if current user is manager at least one group,
   if `group-id` is not `nil`, it'll check whether current user is manager of that specific group."
   ;; check is group manager of at least one group
   ([]
    (check-group-manager nil true))

   ;; check is manager of one specific group
   ([group-id]
    (check-group-manager group-id true))

   ([group-id require-superuser?]
    (u/ignore-exceptions
     (classloader/require 'metabase-enterprise.advanced-permissions.common))
    (if-let [f (and (premium-features/enable-advanced-permissions?)
                    (resolve 'metabase-enterprise.advanced-permissions.common/current-user-is-group-manager?))]
      (api/check-403 (or api/*is-superuser?* (f group-id)))
      (when require-superuser?
        (api/check-superuser)))))
