(ns metabase-enterprise.billing.billing
  "`/api/ee/billing/` endpoint(s)"
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [compojure.core :as compojure :refer [GET]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.date-2.parse :as u.date.parse]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2])
  (:import
   [com.fasterxml.jackson.core JsonParseException]))

(set! *warn-on-reflection* true)

(def ^:private ^String metabase-billing-info-url "https://store-api.metabase.com/api/v2/metabase/billing_info")

(def ^:private ^{:arglists '([token email language])} fetch-billing-status*
  (memoize/ttl
   ^{::memoize/args-fn (fn [[token email language]] [token email language])}
   (fn [token email language]
     (try (some-> metabase-billing-info-url
                  (http/get {:basic-auth   [email token]
                             :language     language
                             :content-type :json})
                  :body
                  (json/parse-string keyword))
          (catch JsonParseException _
            {:content nil})))
   :ttl/threshold (u/hours->ms 5)))

(defn- valid-thru []
  (some->> (premium-features/premium-embedding-token)
           premium-features/fetch-token-status
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
               {:name "Plan" :value "Metabase Enterprise Airgap" :format "string" :display "value"}]}))

(api/defendpoint GET "/"
  "Get billing information. This acts as a proxy between `metabase-billing-info-url` and the client,
   using the embedding token and signed in user's email to fetch the billing information."
  []
  (let [token    (premium-features/premium-embedding-token)
        email    (t2/select-one-fn :email :model/User :id api/*current-user-id*)
        language (i18n/user-locale-string)]
    (if (and token (str/starts-with? token "airgap_"))
      (billing-status)
      (fetch-billing-status* token email language))))

(api/define-routes)
