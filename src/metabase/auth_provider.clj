(ns metabase.auth-provider
  (:require
    [clj-http.client :as http]
    [metabase.driver :as driver]))

(defmulti fetch-auth
  "Multimethod for auth-provider implementations.
   In general, implementations shouldn't change the shape of responses or names
   so that [[driver/incorporate-auth-provider-details]] can decide how to incorporate into details."
  (fn [auth-provider _database-id _auth-provider-details]
    (some-> auth-provider keyword)))

(defmethod fetch-auth :default
  [_auth-provider _database-id _auth-provider-details]
  nil)

(defmethod fetch-auth :http
  [_ _database-id {:keys [url headers]}]
  (let [response (http/get url {:headers headers :as :json})]
    (:body response)))

(defmethod fetch-auth :oauth
  [_ database-id {:keys [token-url headers]}]
  (fetch-auth :http database-id {:url token-url :headers headers}))

(defn fetch-and-incorporate-auth-provider-details
  "Incorporates auth-provider responses with db-details.

  If you have a database you need to pass the database-id as some providers will need to save the response (e.g. refresh-tokens)."
  ([driver db-details]
   (fetch-and-incorporate-auth-provider-details driver nil db-details))
  ([driver database-id {:keys [auth-provider auth-provider-details] :as db-details}]
   (if auth-provider
     (driver/incorporate-auth-provider-details
       driver
       auth-provider
       (fetch-auth auth-provider database-id auth-provider-details)
       (dissoc db-details :auth-provider :auth-provider-details))
     db-details)))
