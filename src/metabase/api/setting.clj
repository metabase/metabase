(ns metabase.api.setting
  "/api/setting endpoints"
  (:require [compojure.core :refer [GET PUT DELETE]]
            [metabase.api.common :refer :all]
            [metabase.models.setting :as setting]
            [metabase.util.schema :as su]))

(defendpoint GET "/"
  "Get all `Settings` and their values. You must be a superuser to do this."
  []
  (check-superuser)
  (setting/all))

(defendpoint GET "/:key"
  "Fetch a single `Setting`. You must be a superuser to do this."
  [key]
  {key su/NonBlankString}
  (check-superuser)
  (let [k (keyword key)
        v (setting/get k)]
    ;; for security purposes, don't return value of a setting if it was defined via env var
    (when (not= v (setting/env-var-value k))
      v)))

(defendpoint PUT "/:key"
  "Create/update a `Setting`. You must be a superuser to do this.
   This endpoint can also be used to delete Settings by passing `nil` for `:value`."
  [key :as {{:keys [value]} :body}]
  {key su/NonBlankString}
  (check-superuser)
  (setting/set! key value))


(define-routes)
