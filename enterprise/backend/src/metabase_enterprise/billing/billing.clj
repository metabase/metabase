(ns metabase-enterprise.billing.billing
  "`/api/ee/billing/` endpoint(s)"
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [compojure.core :as compojure :refer [GET PUT]]
   [metabase.api.common :as api]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^String metabase-billing-info-url "http://example.com")

(def ^:private ^{:arglists '([token email language])} fetch-billing-status*
  (memoize/ttl
   ^{::memoize/args-fn (fn [[token email language]] [token email language])}
   (fn [token email language]
     (let [payload (http/get metabase-billing-info-url {:basic-auth   [email token]
                                                        :language     language
                                                        :content-type :json})]
         (if (:valid payload)
           payload
           (throw (ex-info (:status payload)
                           {:status-code 400})))))
   :ttl/threshold (u/hours->ms 5)))

(api/defendpoint GET "/"
  "Get billing information. This acts as a proxy between `metabase-billing-info-url` and the client,
   using the embedding token and signed in user's email to fetch the billing information."
  []
  (let [token    (premium-features/premium-embedding-token)
        email    (t2/select-one-fn :email :model/User :id api/*current-user-id*)
        language (i18n/user-locale-string)]
    (fetch-billing-status* token email language)))

(api/define-routes)
