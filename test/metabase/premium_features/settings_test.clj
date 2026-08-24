(ns metabase.premium-features.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.test :as mt]
   [metabase.util.http :as u.http]))

(set! *warn-on-reflection* true)

(deftest outbound-http-allowed-networks-test
  (testing "hosted instances default to external-only, so an admin cannot reach our own infrastructure"
    (mt/with-premium-features #{:hosting}
      (is (= :external-only (premium-features.settings/outbound-http-allowed-networks)))))
  (testing "self-hosted defaults to allow-all, so an upgrade does not break a working instance"
    (mt/with-premium-features #{}
      (is (= :allow-all (premium-features.settings/outbound-http-allowed-networks)))))
  (testing "an explicitly configured value wins over the deployment default, in both directions"
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [outbound-http-allowed-networks :external-only]
        (is (= :external-only (premium-features.settings/outbound-http-allowed-networks)))))
    (mt/with-premium-features #{:hosting}
      (mt/with-temporary-setting-values [outbound-http-allowed-networks :allow-private]
        (is (= :allow-private (premium-features.settings/outbound-http-allowed-networks))))))
  (testing "a value outside the three policies is refused"
    (is (thrown? Throwable (premium-features.settings/outbound-http-allowed-networks! :allow-everything)))))

(deftest outbound-http-policy-is-wired-into-the-http-helper-test
  (testing "util.http takes its default straight from this setting, rather than repeating the decision"
    (is (identical? premium-features.settings/outbound-http-allowed-networks
                    u.http/default-network-policy-fn))))
