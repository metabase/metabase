(ns metabase.server.middleware.route-template-carrier-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]
   [metabase.server.middleware.route-template-carrier :as mw.route-template-carrier]))

(deftest wrap-route-template-carrier-installs-a-fresh-volatile-test
  (testing "every request gets its own carrier, regardless of auth method"
    (doseq [request [{} {:embedding/auth-method "api-key"} {:embedding/auth-method "session"}]]
      (let [seen (atom ::not-called)]
        ((mw.route-template-carrier/wrap-route-template-carrier
          (fn [request respond _raise]
            (reset! seen (get request api.macros/route-template-carrier-key))
            (respond {:status 200})))
         request identity identity)
        (is (instance? clojure.lang.Volatile @seen))
        (is (nil? (deref @seen)))))))

(deftest wrap-route-template-carrier-readable-downstream-test
  (testing "a value routing records into the carrier is visible after the inner handler returns"
    (let [carrier (atom nil)]
      ((mw.route-template-carrier/wrap-route-template-carrier
        (fn [request respond _raise]
          (vreset! (get request api.macros/route-template-carrier-key) "/api/card/:id")
          (reset! carrier (get request api.macros/route-template-carrier-key))
          (respond {:status 200})))
       {} identity identity)
      (is (= "/api/card/:id" (deref @carrier))))))
