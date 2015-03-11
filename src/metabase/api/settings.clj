(ns metabase.api.settings
  "/api/settings endpoints"
  (:require [compojure.core :refer [GET POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.models.setting :as settings]))

;; ## Get all settings + values
(defendpoint GET "/" [org]
  (require-params org)
  ;; TODO - need to do a permissions check here !
  (settings/all-with-descriptions org))

;; ## Create/update a setting
(defendpoint POST "/" [:as {{:keys [org key value]} :body}]
  (require-params key value org)
  ;; TODO - permissions check
  (settings/set org (keyword key) value))

;; ## Delete a setting
(defendpoint DELETE "/:key" [key org]
  (require-params key org)
  ;; TODO - perms check
  (settings/delete org (keyword key)))

(define-routes)
