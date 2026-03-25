(ns metabase.oauth-server.system-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [integrant.core :as ig]
   [metabase.agent-api.api] ;; ensure agent API routes are loaded for scopes discovery
   [metabase.oauth-server.system :as oauth-system]
   [metabase.test :as mt]))

#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each (fn [thunk]
                      (try
                        (thunk)
                        (finally
                          (oauth-system/stop!)))))

(deftest system-config-test
  (testing "system-config returns a map with all four integrant keys"
    (let [config (oauth-system/system-config)]
      (is (map? config))
      (is (contains? config :metabase.oauth-server.system/client-store))
      (is (contains? config :metabase.oauth-server.system/code-store))
      (is (contains? config :metabase.oauth-server.system/token-store))
      (is (contains? config :metabase.oauth-server.system/provider))))
  (testing "provider key references the three stores"
    (let [provider-config (get (oauth-system/system-config) :metabase.oauth-server.system/provider)]
      (is (= (ig/ref :metabase.oauth-server.system/client-store) (:client-store provider-config)))
      (is (= (ig/ref :metabase.oauth-server.system/code-store) (:code-store provider-config)))
      (is (= (ig/ref :metabase.oauth-server.system/token-store) (:token-store provider-config))))))

(deftest start-stop-test
  (testing "start! initializes the system and stop! halts it"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [sys (oauth-system/start!)]
        (is (some? sys))
        (is (some? (get sys :metabase.oauth-server.system/provider)))
        (is (instance? oidc_provider.core.Provider
                       (get sys :metabase.oauth-server.system/provider)))
        (oauth-system/stop!)))))

(deftest start-idempotency-test
  (testing "calling start! twice returns the same system"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [sys1 (oauth-system/start!)
            sys2 (oauth-system/start!)]
        (is (identical? sys1 sys2))))))

(deftest stop-idempotency-test
  (testing "calling stop! when never started is safe"
    (oauth-system/stop!))
  (testing "calling stop! twice is safe"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (oauth-system/start!)
      (oauth-system/stop!)
      (oauth-system/stop!))))

(deftest restart-test
  (testing "start! after stop! creates a new system"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [sys1 (oauth-system/start!)]
        (oauth-system/stop!)
        (let [sys2 (oauth-system/start!)]
          (is (some? sys2))
          (is (not (identical? sys1 sys2))))))))
