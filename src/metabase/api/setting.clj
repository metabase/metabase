(ns metabase.api.setting
  "/api/setting endpoints"
  (:require
   [compojure.core :refer [GET PUT]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.models.setting :as setting]
   [metabase.util.malli.schema :as ms]
   [metabase.util.schema :as su]))

(defn- do-with-setting-access-control
  [thunk]
  (try
    (binding [setting/*enforce-setting-access-checks* true]
      (thunk))
    (catch clojure.lang.ExceptionInfo e
      ;; Throw a generic 403 for non-admins, so as to not reveal details about settings
      (api/check-superuser)
      (throw e))))

(defmacro ^:private with-setting-access-control
  "Executes the given body with setting access enforcement enabled, and adds some exception handling to make sure we
   return generic 403s to non-admins who try to read or write settings they don't have access to."
  [& body]
  `(do-with-setting-access-control (fn [] ~@body)))

;; TODO: deprecate /api/session/properties and have a single endpoint for listing settings
#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/"
  "Get all `Settings` and their values. You must be a superuser or have `setting` permission to do this.
  For non-superusers, a list of visible settings and values can be retrieved using the /api/session/properties endpoint."
  []
  (validation/check-has-application-permission :setting)
  (setting/writable-settings))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/"
  "Update multiple `Settings` values. If called by a non-superuser, only user-local settings can be updated."
  [:as {settings :body}]
  (with-setting-access-control
    (setting/set-many! settings))
  api/generic-204-no-content)

(api/defendpoint GET "/:key"
  "Fetch a single `Setting`."
  [key]
  {key ms/NonBlankString}
  (with-setting-access-control
    (setting/user-facing-value key)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/:key"
  "Create/update a `Setting`. If called by a non-admin, only user-local settings can be updated.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`."
  [key :as {{:keys [value]} :body}]
  {key su/NonBlankString}
  (with-setting-access-control
    (setting/set! key value))
  api/generic-204-no-content)

(api/define-routes)
