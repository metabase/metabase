(ns metabase.public-sharing.unlock-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-sharing.unlock :as unlock]))

(deftest verify-password-test
  (testing "matching passwords return true"
    (is (true? (unlock/verify-password "secret123" "secret123"))))
  (testing "mismatched passwords return falsy"
    (is (not (unlock/verify-password "secret123" "wrong"))))
  (testing "nil inputs return falsy"
    (is (not (unlock/verify-password nil "secret123")))
    (is (not (unlock/verify-password "secret123" nil)))
    (is (not (unlock/verify-password nil nil)))))

(deftest password-hash-test
  (testing "returns an 8-char hex string"
    (let [h (unlock/password-hash "mypassword")]
      (is (= 8 (count h)))
      (is (re-matches #"[0-9a-f]{8}" h))))
  (testing "same input produces same hash"
    (is (= (unlock/password-hash "abc") (unlock/password-hash "abc"))))
  (testing "different input produces different hash"
    (is (not= (unlock/password-hash "abc") (unlock/password-hash "xyz")))))

(deftest throttle-key-test
  (is (= "card/abc-123" (unlock/throttle-key :card "abc-123")))
  (is (= "dashboard/xyz" (unlock/throttle-key :dashboard "xyz"))))

(deftest cookie-round-trip-test
  (testing "add-unlock-entry sets a cookie that unlocked? can read back"
    (let [request  {:cookies {}}
          response (unlock/add-unlock-entry request {} :card "uuid-1" "secret")]
      (is (get-in response [:cookies "metabase.PUBLIC_UNLOCK" :value])
          "cookie is set on response")
      (let [cookie-val (get-in response [:cookies "metabase.PUBLIC_UNLOCK" :value])
            request2   {:cookies {"metabase.PUBLIC_UNLOCK" {:value cookie-val}}}]
        (is (unlock/unlocked? request2 :card "uuid-1" "secret"))
        (testing "wrong uuid is not unlocked"
          (is (not (unlock/unlocked? request2 :card "uuid-other" "secret"))))
        (testing "wrong entity type is not unlocked"
          (is (not (unlock/unlocked? request2 :dashboard "uuid-1" "secret"))))))))

(deftest cookie-multiple-entries-test
  (testing "multiple unlock entries accumulate in the cookie"
    (let [request  {:cookies {}}
          resp1    (unlock/add-unlock-entry request {} :card "uuid-1" "pw1")
          cookie1  (get-in resp1 [:cookies "metabase.PUBLIC_UNLOCK" :value])
          request2 {:cookies {"metabase.PUBLIC_UNLOCK" {:value cookie1}}}
          resp2    (unlock/add-unlock-entry request2 {} :dashboard "uuid-2" "pw2")
          cookie2  (get-in resp2 [:cookies "metabase.PUBLIC_UNLOCK" :value])
          request3 {:cookies {"metabase.PUBLIC_UNLOCK" {:value cookie2}}}]
      (is (unlock/unlocked? request3 :card "uuid-1" "pw1"))
      (is (unlock/unlocked? request3 :dashboard "uuid-2" "pw2")))))

(deftest cookie-tamper-detection-test
  (testing "tampered cookie value is rejected"
    (let [request  {:cookies {}}
          response (unlock/add-unlock-entry request {} :card "uuid-1" "secret")
          cookie-val (get-in response [:cookies "metabase.PUBLIC_UNLOCK" :value])
          tampered (str "TAMPERED" cookie-val)
          request2 {:cookies {"metabase.PUBLIC_UNLOCK" {:value tampered}}}]
      (is (not (unlock/unlocked? request2 :card "uuid-1" "secret"))))))

(deftest cookie-dedup-test
  (testing "re-unlocking the same entity+uuid replaces the old entry rather than duplicating"
    (let [request  {:cookies {}}
          resp1    (unlock/add-unlock-entry request {} :card "uuid-1" "pw")
          cookie1  (get-in resp1 [:cookies "metabase.PUBLIC_UNLOCK" :value])
          request2 {:cookies {"metabase.PUBLIC_UNLOCK" {:value cookie1}}}
          resp2    (unlock/add-unlock-entry request2 {} :card "uuid-1" "pw")
          cookie2  (get-in resp2 [:cookies "metabase.PUBLIC_UNLOCK" :value])
          request3 {:cookies {"metabase.PUBLIC_UNLOCK" {:value cookie2}}}]
      (is (unlock/unlocked? request3 :card "uuid-1" "pw")))))

(deftest cookie-password-change-invalidation-test
  (testing "changing the password invalidates existing cookie entries"
    (let [request  {:cookies {}}
          response (unlock/add-unlock-entry request {} :card "uuid-1" "old-password")
          cookie-val (get-in response [:cookies "metabase.PUBLIC_UNLOCK" :value])
          request2 {:cookies {"metabase.PUBLIC_UNLOCK" {:value cookie-val}}}]
      (testing "cookie is valid with old password"
        (is (unlock/unlocked? request2 :card "uuid-1" "old-password")))
      (testing "cookie is invalid after password change"
        (is (not (unlock/unlocked? request2 :card "uuid-1" "new-password")))))))
