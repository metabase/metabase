(ns metabase.util.product-feedback
   (:require
    [cheshire.core :as json]
    [clj-http.client :as http]
    [clojure.string :as str]
    [environ.core :refer [env]]
    [metabase.config :as config]
    [metabase.util :as u]))

(set! *warn-on-reflection* true)

 (def product-feeback-base-url
   "Base url for the product feedback, in DEV it uses a value from an ENV, even if empty, to not send real data to the production endpoint"
    (if (or config/is-dev? config/is-test?)
      (str/replace (or (env :mb-product-feedback-dev-server-url) "") #"/$" "")
   "https://store-api.metabase.com"))


(def ^:private ^:const send-feedback-timeout-ms (u/seconds->ms 10))

(def product-feeback-url
  "Url to use for the product feedback"
  (format "%s/api/v1/crm/product-feedback" product-feeback-base-url))

(defn- send-product-feedback*
  [comments source email]
  (try
    (http/get product-feeback-url {:body
     (json/encode {:comments comments
                   :source   source
                   :email    email})})
    {:status "success"}
    (catch Exception e {:error_code        "connection-error"
                        :error_details     (.getMessage e)
                        :feedback_endpoint product-feeback-url})))

(defn send-product-feedback
  "Send product feedback from the app"
  [comments source email]
  (let [fut    (future (send-product-feedback* comments source email))
        result (deref fut send-feedback-timeout-ms ::timed-out)]
    (if (not= result ::timed-out)
      result
      (do
        (future-cancel fut)
        {:error_code        "timed-out"
         :feedback_endpoint product-feeback-url}))))
