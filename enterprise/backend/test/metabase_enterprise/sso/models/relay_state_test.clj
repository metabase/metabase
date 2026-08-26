(ns metabase-enterprise.sso.models.relay-state-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.sso.models.relay-state :as relay-state]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- store!
  "Generate a key and persist `context` under it, like the GET flow does. Returns the (plaintext) key."
  [context]
  (relay-state/persist! (assoc context :id (relay-state/generate-key))))

(defn- stored-id
  "The primary key actually written to the table for a (plaintext) `key` — i.e. its hash. Used by tests that
  need to poke the raw row, since the table is keyed by the hash, never the plaintext key."
  [key]
  (#'relay-state/hash-key key))

(deftest relay-state-key?-test
  (testing "recognizes generated keys and rejects legacy Base64 continue URLs"
    (is (true? (relay-state/relay-state-key? (str "mbsso_" (random-uuid)))))
    (is (false? (relay-state/relay-state-key? "aHR0cDovL2xvY2FsaG9zdA==")))
    (is (false? (relay-state/relay-state-key? nil)))
    (is (false? (relay-state/relay-state-key? "")))))

(deftest generate-key-test
  (testing "generate-key returns a short, recognizable key within the SAML 80-byte RelayState limit"
    (let [key (relay-state/generate-key)]
      (is (relay-state/relay-state-key? key))
      (is (<= (count (.getBytes ^String key "UTF-8")) 80))
      (testing "and is unique per call"
        (is (not= key (relay-state/generate-key)))))))

(deftest persist!-test
  (testing "persist! stores the context, keyed by the hash of the key (never the plaintext key)"
    (mt/with-model-cleanup [:model/SsoRelayState]
      (let [key (store! {:continue-url "http://localhost:3000/auth/sso"
                         :origin       "https://app.example.com"
                         :embedding?   true})]
        (testing "the plaintext key is NOT stored; the row is keyed by its hash"
          (is (false? (t2/exists? :model/SsoRelayState :id key)))
          (is (true? (t2/exists? :model/SsoRelayState :id (stored-id key)))))
        (let [row (t2/select-one :model/SsoRelayState :id (stored-id key))]
          (is (= "http://localhost:3000/auth/sso" (:continue_url row)))
          (is (= "https://app.example.com" (:origin row)))
          (is (true? (:embedding row)))
          (is (some? (:expires_at row)))
          (is (some? (:created_at row)))))))
  (testing "persist! defaults embedding to false for a regular login"
    (mt/with-model-cleanup [:model/SsoRelayState]
      (let [key (store! {:continue-url "http://localhost:3000/dashboard/1"})
            row (t2/select-one :model/SsoRelayState :id (stored-id key))]
        (is (= "http://localhost:3000/dashboard/1" (:continue_url row)))
        (is (nil? (:origin row)))
        (is (false? (:embedding row)))))))

(deftest find-unexpired-test
  (testing "find-unexpired returns the row WITHOUT deleting it (look-up only, so retries don't burn the key)"
    (mt/with-model-cleanup [:model/SsoRelayState]
      (let [key (store! {:continue-url "http://localhost:3000/auth/sso"
                         :origin       "https://app.example.com"})]
        (is (= "https://app.example.com" (:origin (relay-state/find-unexpired key))))
        ;; a second look-up still finds it — it is not consumed on read
        (is (some? (relay-state/find-unexpired key)))
        (is (true? (t2/exists? :model/SsoRelayState :id (stored-id key)))))))
  (testing "find-unexpired returns nil for an expired entry"
    (mt/with-model-cleanup [:model/SsoRelayState]
      (let [key (store! {:continue-url "http://localhost:3000/auth/sso"})]
        ;; backdate so the entry is already expired
        (t2/update! :model/SsoRelayState (stored-id key) {:expires_at (t/minus (t/offset-date-time) (t/seconds 1))})
        (is (nil? (relay-state/find-unexpired key))))))
  (testing "find-unexpired ignores values that aren't our keys (legacy Base64 RelayState)"
    (is (nil? (relay-state/find-unexpired "aHR0cDovL2xvY2FsaG9zdA==")))))

(deftest delete!-test
  (testing "delete! consumes the entry (single use); a second delete is a harmless no-op"
    (mt/with-model-cleanup [:model/SsoRelayState]
      (let [key (store! {:continue-url "http://localhost:3000/auth/sso"})]
        (is (= 1 (relay-state/delete! key)))
        (is (false? (t2/exists? :model/SsoRelayState :id (stored-id key))))
        (is (= 0 (relay-state/delete! key))))))
  (testing "delete! ignores values that aren't our keys"
    (is (nil? (relay-state/delete! "aHR0cDovL2xvY2FsaG9zdA==")))))

(deftest delete-expired!-test
  (testing "delete-expired! removes only expired entries"
    (mt/with-model-cleanup [:model/SsoRelayState]
      (let [live    (store! {:continue-url "http://localhost:3000/auth/sso" :origin "*"})
            expired (store! {:continue-url "http://localhost:3000/auth/sso" :origin "*"})]
        (t2/update! :model/SsoRelayState (stored-id expired) {:expires_at (t/minus (t/offset-date-time) (t/seconds 1))})
        ;; delete-expired! operates globally, so don't assert an exact count (other tests may leave rows) —
        ;; just confirm our expired entry is purged and the live one survives.
        (is (pos? (relay-state/delete-expired!)))
        (is (true? (t2/exists? :model/SsoRelayState :id (stored-id live))))
        (is (false? (t2/exists? :model/SsoRelayState :id (stored-id expired))))))))
