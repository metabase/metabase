(ns metabase.api.setting
  "/api/setting endpoints"
  (:require [compojure.core :refer [GET PUT DELETE]]
            [metabase.api.common :refer :all]
            (metabase.models [setting :as setting])))

;; ## Get all settings + values
(defendpoint GET "/" []
  (check-403 (:is_superuser @*current-user*))
  (setting/all-with-descriptions))

;; ## Get a single setting
(defendpoint GET "/:key" [key]
  (require-params key)
  (check-403 (:is_superuser @*current-user*))
  (setting/get (keyword key)))

;; ## Create/update a setting
(defendpoint PUT "/:key" [key  :as {{:keys [value]} :body}]
  (require-params key value)
  (check-403 (:is_superuser @*current-user*))
  (setting/set (keyword key) value))

;; ## Delete a setting
(defendpoint DELETE "/:key" [key]
  (require-params key)
  (check-403 (:is_superuser @*current-user*))
  (setting/delete (keyword key)))

(define-routes)
