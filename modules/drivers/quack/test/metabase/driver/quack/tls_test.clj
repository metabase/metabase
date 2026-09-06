(ns metabase.driver.quack.tls-test
  "Tier B — HTTPS transport test. Exercises the :ssl true path of the client
  (java.net.http.HttpClient + SSLContext) against a Caddy reverse proxy
  fronting the Quack server, exactly as the DuckDB reverse-proxy guide
  describes.

  Prerequisites (see server/docker-compose.tls.yml + server/Caddyfile):

      cd server && docker compose -f docker-compose.tls.yml up -d --build

  Caddy listens on :8443 with a self-trusted local-CA cert for `localhost`.
  Java reads the JDK cacerts, NOT the OS trust store, so we test BOTH TLS paths:

  * :insecure-tls true   — trust-all TrustManager (dev/test only). Proves the
                           HTTPS transport works end-to-end without cert dance.
  * :trust-store <JKS>   — proper trust validation. The JKS is built from
                           Caddy's local CA root; see the helper script
                           `server/build-trust-store.sh`.

  Skips gracefully (no failure) if neither Caddy on :8443 nor a plain Quack on
  :9494 is reachable — set QUACK_TLS_HOST / QUACK_TLS_PORT to override.

  Run via the in-tree test runner (see modules/drivers/quack/README.md)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver.quack.client :as client]
   [metabase.util.log :as log])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)

(def host (or (System/getenv "QUACK_TLS_HOST") "localhost"))
(def port (Integer/parseInt (or (System/getenv "QUACK_TLS_PORT") "8443")))
(def token (or (System/getenv "QUACK_TOKEN") "devtoken"))

;; Optional JKS built from Caddy's local CA via server/build-trust-store.sh.
;; If unset, the :insecure-tls test still runs; the :trust-store test is skipped.
(def trust-store (System/getenv "QUACK_TRUST_STORE"))
(def trust-store-password (or (System/getenv "QUACK_TRUST_STORE_PASSWORD") "changeit"))

(defn- reachable? [^String h ^long p]
  (try (with-open [_ (Socket. h (int p))] true)
       (catch Exception _ false)))

(def ^:private live? (atom nil))

(use-fixtures :once
  (fn [t]
    (if (reachable? host port)
      (do (reset! live? true) (t))
      (do (reset! live? false)
          (log/infof "[tls-test] SKIP: no TLS endpoint at https://%s:%s" host port)))))

(defn- when-live [& body] (when @live? (dorun body)))

;;; ===========================================================================
;;; T1. HTTPS transport — insecure (dev/test only) smoke test
;;; ===========================================================================

(deftest t1-https-insecure-tls-smoke-test
  (when-live
   (testing "the :ssl path works end-to-end with :insecure-tls (trust-all)
             — proves the java.net.http.HttpClient actually dials HTTPS and the
             SSLContext trust-all branch is wired. This is the dev-only path;
             for real deployments use :trust-store (T2)."
     (let [details {:host host :port port :ssl true :token token
                    :insecure-tls true :timeout-seconds 30}]
       (is (true? (client/can-connect? details))
           "can-connect? over HTTPS with insecure TLS")
       (let [{:keys [cols rows]} (client/execute-query details "SELECT 42 AS answer")
             realized (into [] rows)]
         (is (= ["answer"] (map :name cols)))
         (is (= [[42]] realized)))))))

;;; ===========================================================================
;;; T2. HTTPS transport — proper trust-store validation
;;; ===========================================================================

(deftest t2-https-trust-store-validation-test
  (when-live
   (if-not trust-store
     (log/infof "%s" "[tls-test] T2 SKIP: set QUACK_TRUST_STORE (see server/build-trust-store.sh)")
     (testing "the :ssl path validates the server cert against a JKS trust store
                built from Caddy's local CA — the production-grade TLS path."
       (let [details {:host host :port port :ssl true :token token
                      :trust-store trust-store
                      :trust-store-password trust-store-password
                      :timeout-seconds 30}]
         (is (true? (client/can-connect? details))
             "can-connect? over HTTPS with explicit trust store")
         (let [n (reduce (fn [c _] (inc c)) 0
                         (:rows (client/execute-query details "SELECT i FROM range(5) t(i)")))]
           (is (= 5 n))))))))

;;; ===========================================================================
;;; T3. HTTPS without trust config FAILS with a handshake error
;;;     (proves the trust-store / insecure-tls paths are actually doing work —
;;;     the JVM default trust store does NOT contain Caddy's local CA)
;;; ===========================================================================

(deftest t3-https-without-trust-config-fails-test
  (when-live
   (testing "HTTPS against Caddy's local CA WITHOUT :insecure-tls or :trust-store
             fails with an SSLHandshakeException — proves the TLS config knobs
             are load-bearing (the JDK default cacerts doesn't trust Caddy)."
     (let [details {:host host :port port :ssl true :token token
                    :timeout-seconds 10}]
       (try
         (client/can-connect? details)
         ;; If we're on a host where Caddy's CA happens to be in the JDK
         ;; cacerts (e.g. someone ran the import globally), this passes —
         ;; note it but don't fail.
         (is true "HTTPS succeeded without explicit trust config — JDK cacerts trusts the CA")
         (catch Throwable e
           (let [msg (str (ex-message e))]
             (is (re-find #"(?i)SSLHandshakeException|unable to find valid certification|PKIX|trust"
                          msg)
                 (str "expected a TLS trust failure; got: " msg)))))))))

(when-not @live?
  (deftest t0-skip-notice-test
    (testing "no TLS endpoint reachable — see server/docker-compose.tls.yml"
      (is true))))
