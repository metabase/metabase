(ns metabase.settings-rest.api
  "/api/setting endpoints"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.util :as u]))

(defn- do-with-setting-access-control
  [thunk]
  (try
    (setting/with-enforced-setting-access-checks
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

(defn- add-settings-last-updated-cookie
  "Add a cookie with the current settings-last-updated timestamp to the response."
  [response]
  (assoc-in response [:mb/cookies :cookie/settings-cache-timestamp] true))

;; TODO: deprecate /api/session/properties and have a single endpoint for listing settings
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get all `Settings` and their values. You must be a superuser or have `setting` permission to do this.
  For non-superusers, a list of visible settings and values can be retrieved using the /api/session/properties endpoint."
  []
  (perms/check-has-application-permission :setting)
  (setting/writable-settings))

(def ^:private kebab-cased-keyword
  "Keyword that can be transformed from \"a_b\" -> :a-b"
  [:keyword {:decode/json #(keyword (u/->kebab-case-en %))}])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/"
  "Update multiple `Settings` values. If called by a non-superuser, only user-local settings can be updated."
  [_route-params
   _query-params
   settings :- [:map-of kebab-cased-keyword :any]]
  (with-setting-access-control
    (setting/set-many! settings))
  (add-settings-last-updated-cookie api/generic-204-no-content))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:key"
  "Fetch a single `Setting`."
  [{:keys [key]} :- [:map
                     [:key kebab-cased-keyword]]]
  (with-setting-access-control
    (setting/user-facing-value key)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:key"
  "Create/update a `Setting`. If called by a non-admin, only user-local settings can be updated.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`."
  [{:keys [key]} :- [:map
                     [:key kebab-cased-keyword]]
   _query-params
   {:keys [value]} :- [:map [:value :any]]]
  (with-setting-access-control
    (setting/set! key value))
  (add-settings-last-updated-cookie api/generic-204-no-content))
