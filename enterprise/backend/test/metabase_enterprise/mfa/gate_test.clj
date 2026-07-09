(ns metabase-enterprise.mfa.gate-test
  (:require
   [clojure.test :refer :all]
   [metabase.auth-identity.provider :as auth-identity.provider]
   [metabase.test :as mt]))

(deftest apply-mfa-gate-runs-without-any-token-test
  (testing "the EE gate dispatches via :feature :none — active with zero premium features (fail-closed:\n           a lapsed license must never disable enforcement)"
    (mt/with-premium-features #{}
      (let [login-result {:success? true :user {:id 1}}]
        (is (= login-result
               (auth-identity.provider/apply-mfa-gate :provider/password login-result)))))))

(deftest apply-mfa-gate-passthrough-test
  (testing "scaffold gate returns every login result unchanged"
    (doseq [login-result [{:success? true :user {:id 1}}
                          {:success? false :error :invalid-credentials}
                          {}]]
      (is (= login-result
             (auth-identity.provider/apply-mfa-gate :provider/password login-result))))))
