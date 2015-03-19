(ns metabase.api.setting
  "/api/setting endpoints"
  (:require [compojure.core :refer [GET PUT DELETE]]
            [metabase.api.common :refer :all]
            (metabase.models [setting :as setting])))

;; ## Get all settings + values
(defendpoint GET "/" []
  (check-superuser)
  (setting/all-with-descriptions))

;; ## Get a single setting
(defendpoint GET "/:key" [key]
  {key Required}
  (check-superuser)
  (setting/get (keyword key)))

;; ## Create/update a setting
(defendpoint PUT "/:key" [key  :as {{:keys [value]} :body}]
  {key Required, value Required}
  (check-superuser)
  (setting/set (keyword key) value))

;; ## Delete a setting
(defendpoint DELETE "/:key" [key]
  {key Required}
  (check-superuser)
  (setting/delete (keyword key)))

(define-routes)
