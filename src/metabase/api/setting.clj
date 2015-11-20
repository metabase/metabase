(ns metabase.api.setting
  "/api/setting endpoints"
  (:require [compojure.core :refer [GET PUT DELETE]]
            [metabase.api.common :refer :all]
            (metabase.models [setting :as setting])))

(defendpoint GET "/"
  "Get all `Settings` and their values. You must be a superuser to do this."
  []
  (check-superuser)
  (setting/all-with-descriptions))

(defendpoint PUT "/"
  "Update multiple `Settings` values.  You must be a superuser to do this."
  [:as {settings :body}]
  {settings [Required Dict]}
  (check-superuser)
  (setting/set-all settings)
  (setting/all-with-descriptions))

(defendpoint GET "/:key"
  "Fetch a single `Setting`. You must be a superuser to do this."
  [key]
  {key Required}
  (check-superuser)
  (setting/get (keyword key)))

(defendpoint PUT "/:key"
  "Create/update a `Setting`. You must be a superuser to do this."
  [key :as {{:keys [value]} :body}]
  {key Required, value Required}
  (check-superuser)
  (setting/set (keyword key) value))

(defendpoint DELETE "/:key"
  "Delete a `Setting`. You must be a superuser to do this."
  [key]
  {key Required}
  (check-superuser)
  (setting/delete (keyword key)))

(define-routes)
