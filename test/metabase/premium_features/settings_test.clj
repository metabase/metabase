(ns metabase.premium-features.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.util.http :as u.http]))

(set! *warn-on-reflection* true)

;;; The `:test` alias passes `-Dmb.outbound.allowed.networks=allow-all` so dev and CI runs can reach local mock
;;; servers, and that value outranks the deployment default. Clearing it is what makes the defaults observable.
(defmacro ^:private with-no-configured-policy [& body]
  `(mt/with-temp-env-var-value! [mb-outbound-allowed-networks nil]
     ~@body))

(deftest outbound-allowed-networks-test
  (testing "hosted instances default to external-only, so an admin cannot reach our own infrastructure"
    (with-no-configured-policy
      (mt/with-premium-features #{:hosting}
        (is (= :external-only (premium-features.settings/outbound-allowed-networks))))))
  (testing "self-hosted defaults to allow-all, so an upgrade does not break a working instance"
    (with-no-configured-policy
      (mt/with-premium-features #{}
        (is (= :allow-all (premium-features.settings/outbound-allowed-networks))))))
  (testing "the env var configures it, in both directions"
    (mt/with-premium-features #{}
      (mt/with-temp-env-var-value! [mb-outbound-allowed-networks "external-only"]
        (is (= :external-only (premium-features.settings/outbound-allowed-networks)))))
    (mt/with-premium-features #{:hosting}
      (mt/with-temp-env-var-value! [mb-outbound-allowed-networks "allow-private"]
        (is (= :allow-private (premium-features.settings/outbound-allowed-networks))))))
  (testing "an unrecognised env value falls back to external-only instead of widening the policy"
    (mt/with-premium-features #{}
      (mt/with-temp-env-var-value! [mb-outbound-allowed-networks "allow-everything"]
        (is (= :external-only (premium-features.settings/outbound-allowed-networks))))))
  (testing "a Metabase admin cannot write it, so the policy stays with whoever runs the process"
    (is (thrown? UnsupportedOperationException
                 (setting/set! :outbound-allowed-networks :allow-all)))))

(deftest outbound-policy-is-wired-into-the-http-helper-test
  (testing "util.http takes its default straight from this setting, rather than repeating the decision"
    (is (identical? premium-features.settings/outbound-allowed-networks
                    u.http/default-network-policy-fn))))
