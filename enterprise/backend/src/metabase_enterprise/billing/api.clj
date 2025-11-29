(ns metabase-enterprise.billing.api
  "`/api/ee/billing/` endpoint(s)"
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]
   [metabase.store-api.core :as store-api]
   [metabase.util :as u]
   [metabase.util.date-2.parse :as u.date.parse]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   [com.fasterxml.jackson.core JsonParseException]))

(set! *warn-on-reflection* true)

(defn- metabase-billing-info-url
  "Returns the Store URL for fetching billing info for the current Metabase instance."
  ^String []
  (str (store-api/store-api-url) "/api/v2/metabase/billing_info"))

(def ^:private ^{:arglists '([token email language])} fetch-billing-status*
  (memoize/ttl
   ^{::memoize/args-fn (fn [[token email language]] [token email language])}
   (fn [token email language]
     (try (some-> (metabase-billing-info-url)
                  (http/get {:basic-auth   [email token]
                             :language     language
                             :content-type :json})
                  :body
                  json/decode+kw)
          (catch JsonParseException _
            {:content nil})))
   :ttl/threshold (u/minutes->ms 5)))

(defn- valid-thru []
  (some->> (premium-features/token-status)
           :valid-thru
           u.date.parse/parse
           (t/format "MMMM d, YYYY")))

(defn billing-status
  "Returns content that powers the billing page in certain circumstances."
  []
  (let [max-users (premium-features/max-users-allowed)
        ;; There is a defsetting for user count, but it is only updated every 5 minutes, and this should be exactly up
        ;; to date here:
        total-users (t2/count :model/User :is_active true, :type :personal)]
    {:version "v1"
     :content [{:name "Users included in your plan" :value max-users :format "integer" :display "value"}
               {:name "Users available" :value (- max-users total-users) :format "integer" :display "value"}
               {:name "Token expiration date" :value (valid-thru) :format "string" :display "value"}
               {:name "Plan" :value "Enterprise Airgap" :format "string" :display "value"}]}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get billing information. This acts as a proxy between `metabase-billing-info-url` and the client,
   using the embedding token and signed in user's email to fetch the billing information."
  []
  (let [token    (premium-features/premium-embedding-token)
        email    (t2/select-one-fn :email :model/User :id api/*current-user-id*)
        language (i18n/user-locale-string)]
    (if (and token (str/starts-with? token "airgap_"))
      (billing-status)
      (fetch-billing-status* token email language))))
