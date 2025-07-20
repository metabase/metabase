(ns metabase.embedding.jwt
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [metabase.embedding.settings :as embedding.settings]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.json :as json]
   [ring.util.codec :as codec]))

(defn- jwt-header
  "Parse a JWT `message` and return the header portion."
  [^String message]
  (let [[header] (str/split message #"\.")]
    (json/decode+kw (codecs/bytes->str (codec/base64-decode header)))))

(defn- check-valid-alg
  "Check that the JWT `alg` isn't `none`. `none` is valid per the standard, but for obvious reasons we want to make sure
  our keys are signed. Unfortunately, I don't think there's an easy way to do this with the JWT library we use, so
  manually parse the token and check the alg."
  [^String message]
  (let [{:keys [alg]} (jwt-header message)]
    (when-not alg
      (throw (Exception. (trs "JWT is missing `alg`."))))
    (when (= alg "none")
      (throw (Exception. (trs "JWT `alg` cannot be `none`."))))))

(defn unsign
  "Parse a \"signed\" (base-64 encoded) JWT and return a Clojure representation. Check that the signature is
  valid (i.e., check that it was signed with `embedding-secret-key`) and it's otherwise a valid JWT (e.g., not
  expired), or throw an Exception."
  [^String message]
  (when (seq message)
    (try
      (check-valid-alg message)
      (jwt/unsign message
                  (or (embedding.settings/embedding-secret-key)
                      (throw (ex-info (tru "The embedding secret key has not been set.") {:status-code 400})))
                  ;; The library will reject tokens with a created at timestamp in the future, so to account for clock
                  ;; skew tell the library to allow for 60 seconds of leeway
                  {:leeway 60})
      ;; if `jwt/unsign` throws an Exception rethrow it in a format that's friendlier to our API
      (catch Throwable e
        (throw (ex-info (ex-message e) {:status-code 400}))))))

(defn get-in-unsigned-token-or-throw
  "Find `keyseq` in the `unsigned-token` (a JWT token decoded by `unsign`) or throw a 400."
  [unsigned-token keyseq]
  (or (get-in unsigned-token keyseq)
      (throw (ex-info (tru "Token is missing value for keypath {0}" keyseq) {:status-code 400}))))
