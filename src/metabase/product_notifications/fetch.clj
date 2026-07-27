(ns metabase.product-notifications.fetch
  "Fetch and validate the complete product notification feed."
  (:require
   [clj-http.client :as http]
   [metabase.config.core :as config]
   [metabase.product-notifications.core :as product-notifications]
   [metabase.util.json :as json])
  (:import
   (java.io InputStream)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(def ^:private max-response-bytes (* 1024 1024))

(defn- bounded-body
  [^InputStream body]
  (with-open [body body]
    (let [bytes (.readNBytes body (inc max-response-bytes))]
      (when (> (alength bytes) max-response-bytes)
        (throw (ex-info "Product notification feed exceeds the response size limit"
                        {:phase :response-size, :limit max-response-bytes})))
      (String. bytes StandardCharsets/UTF_8))))

(defn fetch-feed!
  "Fetch, decode, and normalize the remote product notification feed."
  []
  (let [url      (config/config-str :mb-product-notifications-url)
        response (try
                   (http/get url
                             {:throw-exceptions   false
                              :socket-timeout     5000
                              :connection-timeout 2000
                              :as                 :stream})
                   (catch Exception e
                     (throw (ex-info "Unable to fetch the product notification feed"
                                     {:phase :network, :url url}
                                     e))))]
    (when-not (http/success? response)
      (some-> (:body response) ^InputStream .close)
      (throw (ex-info "Product notification feed returned a non-success status"
                      {:phase :http, :status (:status response), :url url})))
    (let [body (try
                 (bounded-body (:body response))
                 (catch Exception e
                   (if (:phase (ex-data e))
                     (throw e)
                     (throw (ex-info "Unable to read the product notification feed"
                                     {:phase :response, :url url}
                                     e)))))
          feed (try
                 (json/decode+kw body)
                 (catch Exception e
                   (throw (ex-info "Unable to decode the product notification feed"
                                   {:phase :decode, :url url}
                                   e))))]
      (try
        (product-notifications/normalized-feed feed)
        (catch Exception e
          (throw (ex-info "Unable to validate the product notification feed"
                          {:phase :validation, :url url}
                          e)))))))
