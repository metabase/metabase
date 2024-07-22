(ns metabase.auth-provider
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [metabase.driver :as driver]))

(defmulti fetch-auth
  "Multimethod for auth-provider implementations.
   In general, implementations shouldn't change the shape of responses or names
   so that [[driver/incorporate-auth-provider-details]] can decide how to incorporate into details."
  (fn [auth-provider _database-id _db-details]
    auth-provider))

(defmethod fetch-auth :default
  [_auth-provider _database-id _db-details]
  nil)

(defn- parse-http-headers [headers]
  (json/parse-string headers))

(defn- fetch-as-json [url headers]
  (let [response (http/get url {:headers (parse-http-headers headers), :as :json})]
    (:body response)))

(defmethod fetch-auth :http
  [_ _database-id {:keys [http-auth-url http-auth-headers]}]
  (fetch-as-json http-auth-url http-auth-headers))

(defmethod fetch-auth :oauth
  [_ _database-id {:keys [oauth-token-url oauth-token-headers]}]
  (fetch-as-json oauth-token-url oauth-token-headers))

(defn fetch-and-incorporate-auth-provider-details
  "Incorporates auth-provider responses with db-details.

  If you have a database you need to pass the database-id as some providers will need to save the response (e.g. refresh-tokens)."
  ([driver db-details]
   (fetch-and-incorporate-auth-provider-details driver nil db-details))
  ([driver database-id {:keys [auth-provider] :as db-details}]
   (if auth-provider
     (let [auth-provider (keyword auth-provider)]
       (driver/incorporate-auth-provider-details
        driver
        auth-provider
        (fetch-auth auth-provider database-id db-details)
        db-details))
     db-details)))
