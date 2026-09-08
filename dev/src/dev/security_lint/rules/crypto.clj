(ns dev.security-lint.rules.crypto
  "Weak primitives and disabled transport checks.

  These are the clj-holmes rules worth keeping. They match static Java method calls, which clj-kondo's var-usages
  don't cover, so they use `:interop-triggers` and are resolved by method name."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- literal-arg-value
  "The string value of argument 0, when it is a literal. Rules here only judge statically known algorithm names --
  a computed one is someone's configuration indirection and not ours to second-guess."
  [node]
  (some-> (ast/arg node 0) ast/string-value))

(def ^:private weak-digests #{"MD2" "MD4" "MD5" "SHA1" "SHA-1"})

(defrule weak-hash
  {:name        "Weak hash algorithm"
   :description "MD5 and SHA-1 are broken against collisions and unsuitable for signatures or integrity checks."
   :remediation "Use SHA-256 or stronger. For passwords use bcrypt/scrypt/Argon2, not a bare digest."
   ;; A note, not an error: Metabase legitimately uses these as non-cryptographic checksums (cache keys and the
   ;; like), so a hit needs a human to say which kind it is.
   :severity    :note
   :precision   :medium
   :cwe         "CWE-328"
   :interop-triggers #{MessageDigest/getInstance}}
  [{:keys [node]}]
  (when-let [algo (literal-arg-value node)]
    (when (contains? weak-digests (u/upper-case-en algo))
      {:message (str algo " is not collision resistant")})))

(def ^:private weak-ciphers #{"DES" "DESEDE" "3DES" "TRIPLEDES" "BLOWFISH" "RC2" "RC4" "ARCFOUR"})

(defrule weak-cipher
  {:name        "Weak cipher or mode of operation"
   :description (str "DES, 3DES, Blowfish and RC4 are obsolete. ECB mode encrypts identical plaintext blocks to "
                     "identical ciphertext, leaking structure regardless of the cipher.")
   :remediation "Use AES in GCM mode, which provides both confidentiality and integrity."
   :severity    :error
   :precision   :high
   :cwe         "CWE-327"
   :interop-triggers #{Cipher/getInstance}}
  [{:keys [node]}]
  (when-let [spec (literal-arg-value node)]
    (let [upper (u/upper-case-en spec)
          algo  (first (str/split upper #"/"))]
      (cond
        (contains? weak-ciphers algo) {:message (str algo " is an obsolete cipher")}
        (str/includes? upper "/ECB/") {:message "ECB mode leaks plaintext structure"}))))

(def ^:private weak-protocols #{"SSL" "SSLV2" "SSLV3" "TLSV1" "TLSV1.1"})

(defrule weak-ssl-protocol
  {:name        "Obsolete TLS protocol version"
   :description "SSLv2, SSLv3, TLS 1.0 and TLS 1.1 have known attacks and are disallowed by current standards."
   :remediation "Request \"TLSv1.2\", \"TLSv1.3\", or just \"TLS\" to take the platform default."
   :severity    :error
   :precision   :high
   :cwe         "CWE-326"
   :interop-triggers #{SSLContext/getInstance}}
  [{:keys [node]}]
  (when-let [proto (literal-arg-value node)]
    (when (contains? weak-protocols (u/upper-case-en proto))
      {:message (str proto " is an obsolete protocol version")})))

(defrule insecure-hostname-verifier
  {:name        "Hostname verification overridden"
   :description (str "Replacing the default hostname verifier disables the check that a certificate belongs to the "
                     "host being contacted, which makes TLS interceptable.")
   :remediation (str "Leave the default verifier in place. If a self-signed certificate must be trusted, add it to "
                     "a trust store rather than disabling verification.")
   :severity    :error
   :precision   :medium
   :cwe         "CWE-297"
   :interop-triggers #{HttpsURLConnection/setDefaultHostnameVerifier}}
  [_]
  {:message "Default hostname verification is being replaced"})

(defrule weak-random
  {:name        "Non-cryptographic random number generator"
   :description (str "java.util.Random is a linear congruential generator: given a couple of outputs its entire "
                     "future and past sequence can be reconstructed. Anything used as a token, nonce, salt or "
                     "identifier needs an unpredictable source.")
   :remediation "Use java.security.SecureRandom."
   ;; A note rather than an error: plenty of Random uses are for jitter and sampling, where predictability is fine.
   :severity    :note
   :precision   :low
   :cwe         "CWE-338"
   :constructor-triggers #{Random}}
  [_]
  {:message "java.util.Random is predictable -- use SecureRandom if this value is security-relevant"})

(defrule trust-all-certificates
  {:name        "Custom trust manager"
   :description (str "Implementing X509TrustManager replaces certificate chain validation. The common form of this "
                     "accepts every certificate, which makes TLS connections trivially interceptable.")
   :remediation "Add the certificate to a trust store rather than replacing the trust manager."
   :severity    :error
   :precision   :medium
   :cwe         "CWE-295"
   ;; Every way of implementing an interface. `proxy` names it inside a vector, the others as a bare symbol.
   :form-triggers #{reify proxy deftype defrecord}
   ;; UnboundID ships the accept-everything manager ready-made; the LDAPS connection used it for years
   :constructor-triggers #{TrustAllTrustManager}}
  [{:keys [node]}]
  (cond
    (str/includes? (str (ast/head-sym node)) "TrustAllTrustManager")
    {:message "TrustAllTrustManager accepts every certificate"}

    ;; X509ExtendedTrustManager is the same replacement with hostname checks added, not a safer one.
    (some #(re-find #"X509(Extended)?TrustManager$" (ast/->str %))
          (mapcat #(ast/find-nodes ast/symbol-node? %) (ast/args node)))
    {:message "Certificate chain validation is being replaced by a custom trust manager"}))
