(ns representation.http
  (:require [clojure.string :as str]
            [representation.color :as c]
            [representation.util :as u]))

(set! *warn-on-reflection* true)

(defn make-request
  "Make an HTTP request to Metabase API.
   Options:
     :method - HTTP method (:get, :post, etc)
     :url - Full URL
     :api-key - Metabase API key
     :body - Request body (string)
     :content-type - Content type for body (defaults to application/x-yaml)"
  [{:keys [method url api-key body content-type]}]
  (u/debug "Making" method "request to" url)
  (let [ct (or content-type "application/x-yaml")
        cmd (cond-> ["curl" "-s" "-X" (clojure.string/upper-case (name method))]
              api-key (concat ["-H" (str "X-API-Key: " api-key)])
              body (concat ["-H" (str "Content-Type: " ct) "-d" body])
              true (concat [url]))
        result (apply clojure.java.shell/sh cmd)]
    (if (zero? (:exit result))
      {:status 200
       :body (:out result)}
      (throw (ex-info (str "HTTP request failed: " (:err result))
                      {:exit (:exit result)
                       :stderr (:err result)})))))
