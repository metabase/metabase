(ns metabase.api.setting
  "/api/setting endpoints"
  (:require [compojure.core :refer [GET POST DELETE]]
            [metabase.api.common :refer :all]
            (metabase.models [org :refer [Org]]
                             [setting :as setting])))

;; ## Get all settings + values
(defendpoint GET "/" [org]
  (require-params org)
  (write-check Org org)
  (setting/all-with-descriptions org))

;; ## Get a single setting
(defendpoint GET "/:key" [key org]
  (require-params key org)
  (write-check Org org)
  (setting/get org (keyword key)))

;; ## Create/update a setting
;; We could write a separate `PUT` endpoint but that's just needless duplication IMO
(defendpoint POST "/" [:as {{:keys [org key value]} :body}]
  (require-params key value org)
  (write-check Org org)
  (setting/set org (keyword key) value))

;; ## Delete a setting
(defendpoint DELETE "/:key" [key org]
  (require-params key org)
  (write-check Org org)
  (setting/delete org (keyword key)))

(define-routes)
