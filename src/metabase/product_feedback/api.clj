(ns metabase.product-feedback.api
  (:require
   [clj-http.client :as http]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.product-feedback.settings :as product-feedback.settings]
   [metabase.util.i18n :refer [deferred-tru]]
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
      (log/warn (ex-message e))
      (throw e))))

(def ^:private FeedbackComments
  "Limit 3x larger than maximum length allowed by frontend."
  (mu/with-api-error-message
   [:and ms/NonBlankString [:string {:max 300000}]]
   (deferred-tru "value must be a non-blank string with at most 300000 characters.")))

(def ^:private FeedbackSource
  "Frontend uses a short fixed string."
  (mu/with-api-error-message
   [:and ms/NonBlankString [:string {:max 500}]]
   (deferred-tru "value must be a non-blank string with at most 500 characters.")))

(def ^:private FeedbackEmail
  "Maximum usable: 254 octets, cf. https://www.rfc-editor.org/info/rfc3696/#section-3 errata."
  (mu/with-api-error-message
   [:and ms/NonBlankString [:string {:max 320}]]
   (deferred-tru "value must be a non-blank string with at most 320 characters.")))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Endpoint to provide feedback from the product"
  [_route-params
   _query-params
   {:keys [comments source email]} :- [:map {:closed true}
                                       [:comments {:optional true} [:maybe FeedbackComments]]
                                       [:source   FeedbackSource]
                                       [:email    {:optional true} [:maybe FeedbackEmail]]]]
  (future (send-feedback! comments source email))
  api/generic-204-no-content)

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !! Endpoints in this namespace do not currently require auth! Keep this in mind when adding new ones. !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
