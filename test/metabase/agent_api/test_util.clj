(ns metabase.agent-api.test-util
  "Test helpers for the Agent API. Provides JWT authentication setup and
   helper functions for making authenticated requests against agent API endpoints."
  (:require
   [buddy.sign.jwt :as jwt]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util.random :as u.random]
   [methodical.core :as methodical]))

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

(defn captured-events!
  "The `[topic event]` pairs `thunk` publishes.

   Spies with an aux method rather than redefining `publish-event!`: it is a methodical multimethod, and
   swapping its var out from under the namespaces that `defmethod` on it breaks them — a `with-redefs` of it
   makes the tools it is supposed to be observing fail for a reason that has nothing to do with the test.

   The method is `:around` on `:metabase/event`, the key every topic derives from. A `:before` aux on
   `:default` registers without complaint and never runs, which is worse than not spying at all: a test that
   compares what a tool published against what the REST endpoint published then passes on two empty lists."
  [thunk]
  (let [published (atom [])
        spy-key   (gensym "captured-events!")]
    (try
      (methodical/add-aux-method-with-unique-key!
       #'events/publish-event! :around :metabase/event
       (fn [next-method topic event]
         (swap! published conj [topic event])
         (next-method topic event))
       spy-key)
      (thunk)
      (finally
        (methodical/remove-aux-method-with-unique-key!
         #'events/publish-event! :around :metabase/event spy-key)))
    @published))
