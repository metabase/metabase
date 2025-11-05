(ns metabase.warehouses.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.warehouses.settings :as warehouses.settings]))

(use-fixtures :once (fixtures/initialize :db))

(deftest cloud-gateway-ips-test
  (mt/with-temp-env-var-value! [mb-cloud-gateway-ips "1.2.3.4,5.6.7.8"]
    (with-redefs [premium-features/is-hosted? (constantly true)]
      (testing "Setting returns ips given comma delimited ips."
        (is (= ["1.2.3.4" "5.6.7.8"]
               (warehouses.settings/cloud-gateway-ips)))))

    (testing "Setting returns nil in self-hosted environments"
      (with-redefs [premium-features/is-hosted? (constantly false)]
        (is (= nil (warehouses.settings/cloud-gateway-ips)))))))
