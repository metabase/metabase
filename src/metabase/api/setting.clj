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
  (setting/set-many! settings)
  api/generic-204-no-content)

(api/defendpoint GET "/:key"
  "Fetch a single `Setting`."
  [key]
  {key su/NonBlankString}
  (setting/user-facing-value key))

(api/defendpoint PUT "/:key"
  "Create/update a `Setting`. If called by a non-admin, only user-local settings can be updated.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`."
  [key :as {{:keys [value]} :body}]
  {key su/NonBlankString}
  (setting/set! key value)
  api/generic-204-no-content)

(api/define-routes)
