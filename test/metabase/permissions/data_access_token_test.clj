(ns metabase.permissions.data-access-token-test
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.permissions.data-access-token :as data-access-token]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]))

(def ^:private sandbox-ca {:sandbox {10 [:card 1 {"State" "CA"}]}})
(def ^:private sandbox-ny {:sandbox {10 [:card 1 {"State" "NY"}]}})
(def ^:private role-ro    {:impersonation {5 {:role "ro"}}})
(def ^:private role-rw    {:impersonation {5 {:role "rw"}}})
(def ^:private dest-a     {:routing {7 {:destination-db-id 100}}})
(def ^:private dest-b     {:routing {7 {:destination-db-id 200}}})
(def ^:private unrestricted {})

(deftest data-access-compatible?-sandbox-test
  (let [compatible? data-access-token/data-access-compatible?]
    (testing "viewer with the same sandbox can see the creator's blob"
      (is (true? (compatible? sandbox-ca sandbox-ca))))
    (testing "viewer with a different sandbox cannot"
      (is (false? (compatible? sandbox-ca sandbox-ny))))
    (testing "an unsandboxed viewer can see a sandboxed creator's blob (viewer is the superset)"
      (is (true? (compatible? sandbox-ca unrestricted))))
    (testing "a sandboxed viewer cannot see an unsandboxed creator's (full-data) blob"
      (is (false? (compatible? unrestricted sandbox-ca))))))

(deftest data-access-compatible?-impersonation-test
  (let [compatible? data-access-token/data-access-compatible?]
    (testing "same role sees, different role does not"
      (is (true? (compatible? role-ro role-ro)))
      (is (false? (compatible? role-ro role-rw))))
    (testing "an unimpersonated viewer sees an impersonated creator's blob; the reverse is blocked"
      (is (true? (compatible? role-ro unrestricted)))
      (is (false? (compatible? unrestricted role-ro))))))

(deftest data-access-compatible?-routing-test
  (let [compatible? data-access-token/data-access-compatible?]
    (testing "same destination sees, different destination does not"
      (is (true? (compatible? dest-a dest-a)))
      (is (false? (compatible? dest-a dest-b))))
    (testing "the router cohort (admins / __METABASE_ROUTER__, absent token) sees a routed creator's blob"
      (is (true? (compatible? dest-a unrestricted))))
    (testing "a routed viewer cannot see a router-cohort creator's blob"
      (is (false? (compatible? unrestricted dest-a))))))

(deftest data-access-compatible?-combination-test
  (let [compatible? data-access-token/data-access-compatible?
        ;; creator sandboxed AND impersonated
        creator (merge sandbox-ca role-ro)]
    (testing "every active dimension must independently pass"
      (is (true?  (compatible? creator creator)))
      ;; viewer unsandboxed (escape) but shares the role -> sees
      (is (true?  (compatible? creator role-ro)))
      ;; viewer shares the sandbox but holds a different role -> blocked
      (is (false? (compatible? creator (merge sandbox-ca role-rw))))
      ;; fully unrestricted viewer -> sees (superset on both)
      (is (true?  (compatible? creator unrestricted))))))

(deftest data-access-compatible?-multi-table-sandbox-test
  (let [compatible? data-access-token/data-access-compatible?
        creator {:sandbox {10 [:card 1 {"State" "CA"}]
                           20 [:card 2 {"Region" "West"}]}}]
    (testing "viewer must match (or be absent on) EVERY touched table"
      (is (true?  (compatible? creator creator)))
      ;; matches table 10, unsandboxed on 20 -> sees
      (is (true?  (compatible? creator {:sandbox {10 [:card 1 {"State" "CA"}]}})))
      ;; matches table 10 but a different sandbox on table 20 -> blocked
      (is (false? (compatible? creator {:sandbox {10 [:card 1 {"State" "CA"}]
                                                  20 [:card 2 {"Region" "East"}]}}))))))

(deftest data-access-compatible?-oss-test
  (testing "two empty (OSS / unrestricted) tokens are always compatible -> no gating"
    (is (true? (data-access-token/data-access-compatible? unrestricted unrestricted)))))

;;; ------------------------------- token construction / digesting -------------------------------

(defn- do-with-lens
  "Run `thunk` with the three per-dimension contributors stubbed to `sandbox` / `imp` / `routing`."
  [{:keys [sandbox imp routing]} thunk]
  (dynamic-redefs/with-dynamic-fn-redefs
    [data-access-token/sandbox-token-for-table    (fn [_table-id] sandbox)
     data-access-token/impersonation-token-for-db (fn [_db-id] imp)
     data-access-token/routing-token-for-db       (fn [_db-id] routing)]
    (thunk)))

(defn- token-for
  "The token `data-access-token` builds for table 10 in database 5 under the given raw lens."
  [lens]
  (do-with-lens lens #(data-access-token/data-access-token {:database-id 5 :table-ids #{10}})))

(def ^:private ca-lens
  {:sandbox [1 "2026-01-01T00:00Z" {"State" "CA" "CustomerEmail" "person@example.com"}]
   :imp     {:role "analyst_ro"}
   :routing {:destination-db-id 100}})

(deftest data-access-token-does-not-retain-raw-lens-values-test
  (testing "the token is persisted as plaintext EDN on stored_result.data_access_token, so no raw
           sandbox attribute value (potentially PII), GTAP card id, or warehouse role may survive in it"
    (let [printed (pr-str (token-for ca-lens))]
      (doseq [secret ["State" "CA" "CustomerEmail" "person@example.com" "analyst_ro"]]
        (is (not (str/includes? printed secret))
            (format "raw lens value %s leaked into the stored token" (pr-str secret)))))))

(deftest data-access-token-keeps-per-target-structure-test
  (testing "digesting the values leaves the dimension/target keys intact, so data-access-compatible?
           can still reason per table-id and per db-id"
    (let [token (token-for ca-lens)]
      (is (= #{:sandbox :impersonation :routing} (set (keys token))))
      (is (= #{10} (set (keys (:sandbox token)))))
      (is (= #{5} (set (keys (:impersonation token)))))
      (is (= #{5} (set (keys (:routing token))))))))

(deftest data-access-token-digest-is-stable-and-discriminating-test
  (testing "a digest is deterministic — the creator's stored token and a later viewer's freshly
           computed token are produced in different processes and must still compare equal"
    (is (= (token-for ca-lens) (token-for ca-lens))))
  (testing "map entry order must not change the digest (map iteration order is not part of the lens)"
    (is (= (token-for ca-lens)
           (token-for (assoc ca-lens :sandbox [1 "2026-01-01T00:00Z" {"CustomerEmail" "person@example.com"
                                                                      "State"         "CA"}])))))
  (testing "any change in the underlying lens changes the digest"
    (are [changed] (not= (token-for ca-lens) (token-for changed))
      (assoc ca-lens :sandbox [1 "2026-01-01T00:00Z" {"State" "NY" "CustomerEmail" "person@example.com"}])
      (assoc ca-lens :sandbox [2 "2026-01-01T00:00Z" {"State" "CA" "CustomerEmail" "person@example.com"}])
      (assoc ca-lens :sandbox [1 "2026-06-01T00:00Z" {"State" "CA" "CustomerEmail" "person@example.com"}])
      (assoc ca-lens :imp {:role "analyst_rw"})
      (assoc ca-lens :routing {:destination-db-id 200}))))

(deftest data-access-token-compatibility-survives-digesting-test
  (testing "the gate's semantics are unchanged when both sides are digested"
    (let [creator (token-for ca-lens)]
      (testing "same lens -> compatible"
        (is (true? (data-access-token/data-access-compatible? creator (token-for ca-lens)))))
      (testing "different sandbox attribute value -> blocked"
        (is (false? (data-access-token/data-access-compatible?
                     creator
                     (token-for (assoc ca-lens :sandbox [1 "2026-01-01T00:00Z" {"State" "NY"}]))))))
      (testing "unrestricted viewer -> compatible; restricted viewer over an unrestricted creator -> blocked"
        (is (true?  (data-access-token/data-access-compatible? creator (token-for {}))))
        (is (false? (data-access-token/data-access-compatible? (token-for {}) creator)))))))

(deftest data-access-token-is-edn-round-trippable-test
  (testing "stored_result serializes the token with pr-str and reads it back with a reader-less
           edn/read-string, so every value in it must survive that round trip"
    (let [token (token-for ca-lens)]
      (is (= token (edn/read-string {:readers {} :default (fn [_tag v] v)} (pr-str token)))))))
