(ns metabase.settings.api
  "/api/setting endpoints"
  (:require
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.macros :as api.macros]
   [metabase.settings.models.setting :as setting]
   [metabase.util :as u]))

;; TODO: deprecate /api/session/properties and have a single endpoint for listing settings
(api.macros/defendpoint :get "/"
  "Get all `Settings` and their values. You must be a superuser or have `setting` permission to do this.
  For non-superusers, a list of visible settings and values can be retrieved using the /api/session/properties endpoint."
  []
  (validation/check-has-application-permission :setting)
  (setting/writable-settings))

(def ^:private kebab-cased-keyword
  "Keyword that can be transformed from \"a_b\" -> :a-b"
  [:keyword {:decode/json #(keyword (u/->kebab-case-en %))}])

(api.macros/defendpoint :put "/"
  "Update multiple `Settings` values. If called by a non-superuser, only user-local settings can be updated."
  [_route-params
   _query-params
   settings :- [:map-of kebab-cased-keyword :any]]
  (setting/with-setting-access-control
    (setting/set-many! settings))
  api/generic-204-no-content)

(api.macros/defendpoint :get "/:key"
  "Fetch a single `Setting`."
  [{:keys [key]} :- [:map
                     [:key kebab-cased-keyword]]]
  (setting/with-setting-access-control
    (setting/user-facing-value key)))

(api.macros/defendpoint :put "/:key"
  "Create/update a `Setting`. If called by a non-admin, only user-local settings can be updated.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`."
  [{:keys [key]} :- [:map
                     [:key kebab-cased-keyword]]
   _query-params
   {:keys [value]}]
  (setting/with-setting-access-control
    (setting/set! key value))
  api/generic-204-no-content)
