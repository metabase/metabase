(ns metabase.api.setting
  "/api/setting endpoints"
  (:require [compojure.core :refer [GET POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.models.setting :as setting]))

;; ## Get all settings + values
(defendpoint GET "/" [org]
  (require-params org)
  ;; TODO - need to do a permissions check here !
  (setting/all-with-descriptions org))

;; ## Create/update a setting
(defendpoint POST "/" [:as {{:keys [org key value]} :body}]
  (require-params key value org)
  ;; TODO - permissions check
  (setting/set org (keyword key) value))

;; ## Delete a setting
(defendpoint DELETE "/:key" [key org]
  (require-params key org)
  ;; TODO - perms check
  (setting/delete org (keyword key)))

(define-routes)
