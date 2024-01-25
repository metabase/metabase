(ns metabase.api.billing
  "/api/billing endpoints"
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [compojure.core :refer [GET PUT]]
   [metabase.api.common :as api]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^String metabase-billing-info-url "http://example.com")

(def ^:private ^{:arglists '([token email language])} fetch-billing-status*
  (memoize/ttl
   ^{::memoize/args-fn (fn [[token email language]] [token email language])}
   (fn [token email language]
     (try
       (http/get metabase-billing-info-url {:basic-auth   [email token]
                                            :language     language
                                            :content-type :json})
       (catch Throwable e
         (throw (ex-info (tru "Unable to fetch billing status: {0}" (ex-message e))
                         {:status-code 400}
                         e)))))
   :ttl/threshold (u/hours->ms 5)))

(api/defendpoint GET "/"
  "Get billing information. This acts as a proxy between `metabase-billing-info-url` and the client,
   using the token and email of the currently signed in user to fetch the data."
  []
  (let [token    (premium-features/premium-embedding-token)
        email    (t2/select-one-fn :email :model/User :id api/*current-user-id*)
        language (public-settings/site-locale)]
    (fetch-billing-status* token email language)))

(api/define-routes)