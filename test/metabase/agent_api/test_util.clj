(ns metabase.agent-api.test-util
  "Test helpers for the Agent API. Provides JWT authentication setup and
   helper functions for making authenticated requests against agent API endpoints."
  (:require
   [buddy.sign.jwt :as jwt]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util.random :as u.random]))

(set! *warn-on-reflection* true)

(def default-jwt-secret
  "Default JWT secret for agent API tests. Regenerated on each test run."
  (u.random/secure-hex 32))

(def default-jwt-idp-uri "http://test.idp.metabase.com")

(defn- current-epoch-seconds []
  (quot (System/currentTimeMillis) 1000))

(defn sign-jwt
  "Sign a JWT with the test secret. Automatically adds `iat` claim if not present."
  [claims]
  (jwt/sign (merge {:iat (current-epoch-seconds)} claims) default-jwt-secret))

(defn auth-headers
  "Create authorization headers with a signed JWT for the given email."
  ([]
   (auth-headers "rasta@metabase.com"))
  ([email]
   {"authorization" (str "Bearer " (sign-jwt {:email email}))}))

(defn agent-client
  "Helper for making authenticated agent API requests.
   Takes a test user keyword (e.g. :rasta, :crowberto), method, expected status, endpoint,
   and optional body for POST/PUT requests."
  [user method expected-status endpoint & [body]]
  (let [email   (:username (mt/user->credentials user))
        headers (auth-headers email)]
    (apply client/client method expected-status endpoint
           {:request-options {:headers headers}}
           (when body [body]))))
