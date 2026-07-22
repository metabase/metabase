(ns metabase.driver.quack.ssh-tunnel-test
  "Unit tests for SSH tunnel (bastion) support.

  These guard the wiring that lets the Quack driver — which parents on :sql and
  speaks HTTP, not JDBC — honor Metabase's SSH tunnel feature (the tunnel
  machinery normally lives in the :sql-jdbc layer and is never on this driver's
  code path; we open the tunnel ourselves around each op).

  Tier A-class: needs the Metabase classpath, but NO live server and NO bastion.
  The negative test (s5) points at an RFC-6761 unresolvable bastion so it fails
  fast at the SSH client with an UnresolvedAddressException — proving the tunnel
  path is taken without needing a real SSH server.

  Run standalone:
    cd ../metabase
    clojure -A:dev:drivers:drivers-dev -m metabase.driver.quack.ssh-tunnel-test"
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.quack :as quack]
   [metabase.driver.quack.conn :as quack.conn]))

(set! *warn-on-reflection* true)
(driver/initialize! :quack)

;; The tunnel wiring is private glue (there's no public multimethod for "apply
;; a tunnel to a conn-spec"). Test it directly via the var — this deliberately
;; exercises the pure plumbing so regressions in tunnel propagation are caught
;; without standing up a Quack server + bastion. The live end-to-end behavior is
;; covered by test/e2e-ssh.sh.
(def ^:private details->conn-spec        @#'quack.conn/details->conn-spec)
(def ^:private with-ssh-tunnel-conn-spec @#'quack/with-ssh-tunnel-conn-spec)

;;; ===========================================================================
;;; S1. details->conn-spec normalizes the Metabase detail spellings
;;; ===========================================================================

(deftest s1-details->conn-spec-normalizes-metabase-details-test
  (testing "unrelated temporal settings do not override the HTTP timeout"
    (let [cs (details->conn-spec {:host "h" :port 9494 :token "t"
                                  :use-ssl true :max-temporal-export-lag 30})]
      (is (= {:host "h" :port 9494 :ssl true :token "t" :timeout-seconds 60}
             cs))))
  (testing "defaults applied when port/ssl/timeout are omitted"
    (let [cs (details->conn-spec {:host "h" :token "t"})]
      (is (= 9494 (:port cs)))
      (is (false? (:ssl cs)))
      (is (= 60 (:timeout-seconds cs))))))

;;; ===========================================================================
;;; S2. details->conn-spec is idempotent on already-flat conn-specs
;;;     (execute-raw-queries! recycles conn-specs, so this must round-trip)
;;; ===========================================================================

(deftest s2-details->conn-spec-idempotent-on-flat-spec-test
  (testing "an already-flat conn-spec round-trips unchanged"
    (let [cs {:host "h" :port 1234 :ssl false :token "t" :timeout-seconds 99}]
      (is (= cs (details->conn-spec cs))))))

;;; ===========================================================================
;;; S3. details->conn-spec carries ALL tunnel-* keys into the conn-spec
;;;     (if one is dropped, the tunnel won't open that auth mode)
;;; ===========================================================================

(deftest s3-details->conn-spec-carries-tunnel-keys-test
  (testing "every tunnel-* detail propagates so the per-op tunnel can open"
    (let [src {:host "h" :port 9494 :token "t"
               :tunnel-enabled true :tunnel-host "bast" :tunnel-port 2222
               :tunnel-user "u" :tunnel-pass "p" :tunnel-auth-option "ssh-key"
               :tunnel-private-key "KEY" :tunnel-private-key-passphrase "PHR"
               :tunnel-known-hosts "KH"}
          cs  (details->conn-spec src)]
      (is (true? (:tunnel-enabled cs)))
      (is (= "bast" (:tunnel-host cs)))
      (is (= 2222   (:tunnel-port cs)))
      (is (= "u"    (:tunnel-user cs)))
      (is (= "p"    (:tunnel-pass cs)))
      (is (= "KEY"  (:tunnel-private-key cs)))
      (is (= "PHR"  (:tunnel-private-key-passphrase cs)))
      (is (= "KH"   (:tunnel-known-hosts cs))))))

;;; ===========================================================================
;;; S4. no-tunnel path: f gets the plain conn-spec (real host/port), no SSH
;;;     session is ever created. Guards the common case against regressions.
;;; ===========================================================================

(deftest s4-with-ssh-tunnel-conn-spec-no-tunnel-passthrough-test
  (testing "with no tunnel configured, f runs against the real host/port and no SSH session is created"
    (let [captured (atom nil)
          result   (with-ssh-tunnel-conn-spec
                     {:host "quack" :port 9494 :token "devtoken"}
                     (fn [cs] (reset! captured cs) ::called))]
      (is (= ::called result))
      (is (= "quack" (:host @captured))
          "the real host reaches the client unrewritten")
      (is (= 9494 (:port @captured))
          "the real port reaches the client unrewritten")
      (is (not (:tunnel-session @captured))
          "no SSH session object is created when the tunnel is disabled"))))

;;; ===========================================================================
;;; S5. tunnel path: an unresolvable bastion fails at the SSH client
;;;     (proves the tunnel code path is genuinely taken, with no infra needed).
;;;
;;; A bypass would instead produce a 'quack' connection error; an SSH-client
;;; error naming the BASTION proves the driver tried to establish the session.
;;; `nonexistent-bastion.invalid` uses the RFC-6761 reserved .invalid TLD so it
;;; resolves immediately to a DNS failure (fast, no 30s timeout).
;;; ===========================================================================

(def ^:private unresolvable-bastion "nonexistent-quack-bastion.invalid")

(deftest s5-with-ssh-tunnel-conn-spec-bogus-bastion-fails-at-ssh-test
  (testing "with a tunnel configured, an unresolvable bastion fails with an SSH-client error naming the bastion"
    (let [details {:host "quack" :port 9494 :token "devtoken"
                   :tunnel-enabled true
                   :tunnel-host unresolvable-bastion
                   :tunnel-port 2222 :tunnel-user "u"
                   :tunnel-auth-option "ssh-key" :tunnel-private-key "ssh-ed25519 NOTAREALKEY"}]
      (try
        (with-ssh-tunnel-conn-spec details (fn [_] ::should-not-reach))
        (is false "should have thrown — the bogus bastion must fail")
        (catch Throwable e
          (let [msg (str (ex-message e))]
            (is (re-find #"(?i)nonexistent-quack-bastion|unresolvedaddress|connectfuture"
                         msg)
                (str "expected an SSH-client error naming the BASTION; got: " msg))))))))

;;; ===========================================================================
;;; S6. incorporate-ssh-tunnel-details is implemented for :quack and is a
;;;     no-op when the tunnel is disabled (consistency with :sql-jdbc / :h2)
;;; ===========================================================================

(deftest s6-incorporate-ssh-tunnel-details-no-tunnel-test
  (testing "incorporate-ssh-tunnel-details returns details unchanged when the tunnel is disabled"
    (let [d {:host "h" :port 9494 :token "t"}]
      (is (= d (driver/incorporate-ssh-tunnel-details :quack d))
          "the :quack method must be implemented and be a passthrough when disabled"))))
