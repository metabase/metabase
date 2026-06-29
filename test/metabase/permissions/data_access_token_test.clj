(ns metabase.permissions.data-access-token-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.data-access-token :as data-access-token]))

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
