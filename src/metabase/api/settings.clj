(ns metabase.api.settings
  "/api/settings endpoints"
  (:require [compojure.core :refer [GET POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.models.setting :as settings]))

;; ## Get all settings + values
(defendpoint GET "/" []
  ;; TODO - need to do a permissions check here !
  (settings/all))

;; ## Create/update a setting
(defendpoint POST "/" [:as {{:keys [name value]} :body}]
  (require-params name value)
  ;; TODO - permissions check
  (settings/set (keyword name) value))

;; ## Delete a setting
(defendpoint DELETE "/:name" [name]
  (require-params name)
  (settings/delete (keyword name)))

(define-routes)
