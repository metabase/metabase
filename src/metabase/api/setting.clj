(ns metabase.api.setting
  "/api/setting endpoints"
  (:require [compojure.core :refer [GET PUT]]
            [metabase.api.common :as api]
            [metabase.models.setting :as setting]
            [metabase.util.schema :as su]))

;; TODO: deprecate /api/session/properties and have a single endpoint for listing settings
(api/defendpoint GET "/"
  "Get all `Settings` and their values. You must be a superuser to do this. For non-superusers, a list of visible
  settings and values can be retrieved using the /api/session/properties endpoint."
  []
  (api/check-superuser)
  (setting/admin-writable-settings))

(api/defendpoint PUT "/"
  "Update multiple `Settings` values. If called by a non-superuser, only user-local settings can be updated."
  [:as {settings :body}]
  (try
    (setting/set-many! settings)
    (catch clojure.lang.ExceptionInfo e
      ;; Throw a generic 403 for non-admins, so as to not reveal details about settings
      (api/check-superuser)
      (throw e)))
  api/generic-204-no-content)

(api/defendpoint GET "/:key"
  "Fetch a single `Setting`."
  [key]
  {key su/NonBlankString}
  (try
    (setting/user-facing-value key)
    (catch clojure.lang.ExceptionInfo e
      ;; Throw a generic 403 for non-admins, so as to not reveal details about settings
      (api/check-superuser)
      (throw e))))

(api/defendpoint PUT "/:key"
  "Create/update a `Setting`. If called by a non-admin, only user-local settings can be updated.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`."
  [key :as {{:keys [value]} :body}]
  {key su/NonBlankString}
  (try
    (setting/set! key value)
    (catch clojure.lang.ExceptionInfo e
      ;; Throw a generic 403 for non-admins, so as to not reveal details about settings
      (api/check-superuser)
      (throw e)))
  api/generic-204-no-content)

(api/define-routes)
