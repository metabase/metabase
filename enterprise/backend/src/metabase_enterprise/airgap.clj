(ns metabase-enterprise.airgap
  (:require [buddy.core.keys :as keys]
            [buddy.sign.jwt :as jwt]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [java-time.api :as t]
            [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.malli :as mu]
            [metabase.util.malli.schema :as ms])
  (:import [java.io Reader]))

(set! *warn-on-reflection* true)

(mu/defn ^:private valid-now? [token :- premium-features/TokenStatus] :- :boolean
  (t/before? (t/instant) (t/instant (:valid-thru token))))

(defn- token? [token]
  (and token (str/starts-with? token "airgap_")))

(mu/defn ^:private pubkey-reader ^Reader [] :- [:maybe (ms/InstanceOfClass Reader)]
  (when-let [pubkey-resource (io/resource "airgap/pubkey.pem")]
    (io/reader pubkey-resource)))

(mu/defn ^:private decode-token :- :map
  "Given an encrypted airgap token, decrypts it and returns a TokenStatus"
  [token]
  (when-not (token? token)
    (throw (ex-info "Malformed airgap token" {:token token})))
  (let [token         (str/replace token #"^airgap_" "")
        pubkey-reader (pubkey-reader)]
    (when-not pubkey-reader
      (throw (ex-info "No public key available for airgap token" {})))
    (let [pub-key   (with-open [rdr pubkey-reader]
                      (keys/public-key rdr))
          decrypted (jwt/decrypt token pub-key {:alg :rsa-oaep :enc :a128cbc-hs256})]
      (if (valid-now? decrypted)
        decrypted
        {:valid         false
         :status        (tru "Unable to validate token")
         :error-details (tru "Token validation failed.")}))))

(defenterprise decode-airgap-token
  "Decodes the airgap token and returns the decoded token."
  :feature :none [token] (decode-token token))

(defenterprise token-valid-now?
  "Check that the decoded token is still valid and returns the decoded token."
  :feature :none [token-status] (valid-now? token-status))
