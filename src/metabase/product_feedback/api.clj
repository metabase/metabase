(ns metabase.product-feedback.api
  (:require
   [clj-http.client :as http]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.product-feedback.settings :as product-feedback.settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn send-feedback!
  "Sends the feedback to the api endpoint"
  [comments :- [:maybe ms/NonBlankString]
   source :- ms/NonBlankString
   email :- [:maybe ms/NonBlankString]]
  (try
    (http/post (or product-feedback.settings/product-feedback-url
                   ;; this error should mostly be dev-facing
                   (throw (ex-info "metabase.product-feedback.settings/product-feedback-url (MB_PRODUCT_FEEDBACK_URL) is not set"
                                   {})))
               {:content-type :json
                :body         (json/encode {:comments comments
                                            :source   source
                                            :email    email})})
    (catch Exception e
      (log/warn e)
      (throw e))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Endpoint to provide feedback from the product"
  [_route-params
   _query-params
   {:keys [comments source email]} :- [:map
                                       [:comments {:optional true} [:maybe ms/NonBlankString]]
                                       [:source   ms/NonBlankString]
                                       [:email    {:optional true} [:maybe ms/NonBlankString]]]]
  (future (send-feedback! comments source email))
  api/generic-204-no-content)

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !! Endpoints in this namespace do not currently require auth! Keep this in mind when adding new ones. !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
