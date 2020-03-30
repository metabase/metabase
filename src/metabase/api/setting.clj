(ns metabase.api.setting
  "/api/setting endpoints"
  (:require [compojure.core :refer [GET PUT]]
            [metabase.api.common :as api]
            [metabase.models.setting :as setting]
            [metabase.util.schema :as su]))

(api/defendpoint GET "/"
  "Get all `Settings` and their values. You must be a superuser to do this."
  []
  (api/check-superuser)
  (setting/all))

(api/defendpoint PUT "/"
  "Update multiple `Settings` values.  You must be a superuser to do this."
  [:as {settings :body}]
  (api/check-superuser)
  (setting/set-many! settings)
  api/generic-204-no-content)

(api/defendpoint GET "/:key"
  "Fetch a single `Setting`. You must be a superuser to do this."
  [key]
  {key su/NonBlankString}
  (api/check-superuser)
  (setting/user-facing-value key))

(api/defendpoint PUT "/:key"
  "Create/update a `Setting`. You must be a superuser to do this.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`."
  [key :as {{:keys [value]} :body}]
  {key su/NonBlankString}
  (api/check-superuser)
  (setting/set! key value)
  api/generic-204-no-content)


(api/define-routes)
