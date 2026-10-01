(ns metabase.permissions.data-access-token-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.permissions.data-access-token :as data-access-token]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]))

(def ^:private sandbox-ca {:sandbox {10 "d-ca"}})
(def ^:private sandbox-ny {:sandbox {10 "d-ny"}})
(def ^:private role-ro    {:impersonation {5 "d-ro"}})
(def ^:private role-rw    {:impersonation {5 "d-rw"}})
(def ^:private dest-a     {:routing {7 "d-100"}})
(def ^:private dest-b     {:routing {7 "d-200"}})
(def ^:private unrestricted {})

(deftest data-access-compatible?-sandbox-test
  (let [compatible? data-access-token/data-access-compatible?]
    (testing "viewer with the same sandbox can see the creator's blob"
      (is (true? (compatible? sandbox-ca sandbox-ca))))
    (testing "viewer with a different sandbox cannot"
      (is (false? (compatible? sandbox-ca sandbox-ny))))
    (testing "an unsandboxed viewer cannot see a sandboxed creator's blob — a sandboxed creator's
              snapshot is served only to viewers with the exact same sandbox, even though a filter
              sandbox's rows are a subset of the raw table this viewer could query directly"
      (is (false? (compatible? sandbox-ca unrestricted))))
    (testing "a sandboxed viewer cannot see an unsandboxed creator's (full-data) blob"
      (is (false? (compatible? unrestricted sandbox-ca))))))

(deftest data-access-compatible?-impersonation-test
  (let [compatible? data-access-token/data-access-compatible?]
    (testing "same role sees, different role does not"
      (is (true? (compatible? role-ro role-ro)))
      (is (false? (compatible? role-ro role-rw))))
    (testing "an unimpersonated viewer cannot see an impersonated creator's blob — a role's view is
              not guaranteed to be a subset of the default connection's (role-scoped RLS can be
              arbitrary). The reverse is blocked too. Superusers bypass the gate upstream"
      (is (false? (compatible? role-ro unrestricted)))
      (is (false? (compatible? unrestricted role-ro))))))

(deftest data-access-compatible?-routing-test
  (let [compatible? data-access-token/data-access-compatible?]
    (testing "same destination sees, different destination does not"
      (is (true? (compatible? dest-a dest-a)))
      (is (false? (compatible? dest-a dest-b))))
    (testing "a router-cohort viewer (absent token: resolves to the router db) cannot see a routed
              creator's blob — router and destination contents are unconstrained relative to each
              other, so there is no containment to rely on. Superusers bypass the gate upstream"
      (is (false? (compatible? dest-a unrestricted))))
    (testing "a routed viewer cannot see a router-cohort creator's blob"
      (is (false? (compatible? unrestricted dest-a))))
    (testing "two router-cohort users (both absent) share the router db's rows"
      (is (true? (compatible? unrestricted unrestricted))))))

(deftest data-access-compatible?-combination-test
  (let [compatible? data-access-token/data-access-compatible?
        ;; creator sandboxed AND impersonated
        creator (merge sandbox-ca role-ro)]
    (testing "every active dimension must independently pass"
      (is (true?  (compatible? creator creator)))
      ;; viewer shares the role but is unsandboxed -> blocked (the sandbox dimension is strict)
      (is (false? (compatible? creator role-ro)))
      ;; viewer shares the sandbox but holds a different role -> blocked
      (is (false? (compatible? creator (merge sandbox-ca role-rw))))
      ;; fully unrestricted viewer -> blocked
      (is (false? (compatible? creator unrestricted))))))

(deftest data-access-compatible?-multi-table-sandbox-test
  (let [compatible? data-access-token/data-access-compatible?
        creator {:sandbox {10 "d-ca" 20 "d-west"}}]
    (testing "viewer must match on EVERY touched table"
      (is (true?  (compatible? creator creator)))
      ;; matches table 10, unsandboxed on 20 -> blocked (no relaxation for absence)
      (is (false? (compatible? creator {:sandbox {10 "d-ca"}})))
      ;; matches table 10 but a different sandbox on table 20 -> blocked
      (is (false? (compatible? creator {:sandbox {10 "d-ca" 20 "d-east"}}))))))

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
  (testing "the token is persisted as plaintext JSON on stored_result.data_access_token, so no raw
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
      (testing "a sandbox entry is a bare digest, same shape as the other dimensions"
        (is (string? (get-in token [:sandbox 10]))))
      (is (= #{5} (set (keys (:impersonation token)))))
      (is (= #{5} (set (keys (:routing token))))))))

(deftest data-access-token-digest-is-stable-and-discriminating-test
  (testing "a digest is deterministic — the creator's stored token and a later viewer's freshly
           computed token are produced in different processes and must still compare equal"
    (is (= (token-for ca-lens) (token-for ca-lens))))
  (testing "map entry order must not change the digest (map iteration order is not part of the lens)"
    (is (= (token-for ca-lens)
           (token-for (assoc ca-lens :sandbox
                             [1 "2026-01-01T00:00Z" {"CustomerEmail" "person@example.com"
                                                     "State"         "CA"}])))))
  (testing "any change in the underlying lens changes the token"
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
                     (token-for (assoc ca-lens :sandbox
                                       [1 "2026-01-01T00:00Z" {"State" "NY"}]))))))
      (testing "an unrestricted viewer is blocked by the creator's impersonation/routing dimensions
                (strict), and a restricted viewer over an unrestricted creator is blocked too"
        (is (false? (data-access-token/data-access-compatible? creator (token-for {}))))
        (is (false? (data-access-token/data-access-compatible? (token-for {}) creator)))))))

(defn- transform-in  [token] ((:in data-access-token/data-access-token-transform) token))
(defn- transform-out [s]     ((:out data-access-token/data-access-token-transform) s))

(deftest data-access-token-is-json-round-trippable-test
  (testing "the token is persisted as JSON and read back identically. JSON has no integer map keys,
           so the transform decodes against the token schema to restore them — which matters both
           because the gate is bare `=` and because callers index the dimensions by target id"
    (doseq [token [(token-for ca-lens) sandbox-ca role-ro dest-a unrestricted
                   {:sandbox {10 "d-ca" 20 "d-west"}}]]
      (let [stored (transform-in token)]
        (is (string? stored))
        (is (= token (transform-out stored)) (pr-str token))))))

(deftest data-access-token-nil-is-sql-null-test
  (testing "nil is stored as SQL NULL rather than the string \"null\", and an empty (unrestricted)
           token stays an empty map — nil and {} are not interchangeable to the gate"
    (is (nil? (transform-in nil)))
    (is (nil? (transform-out nil)))
    (is (= {} (transform-out (transform-in {}))))))

(deftest data-access-token-dimensions-are-keyed-by-target-test
  (testing "each dimension is keyed by its target id, so a caller can ask about one target directly.
           `metabase.metabot.metadata-perms/row-restricted-by-db` does exactly this to decide whether
           a table's rows are narrowed, and a shape it cannot index would silently report every table
           unrestricted"
    (let [token (do-with-lens {:sandbox [1 "2026-01-01T00:00Z" {"State" "CA"}]}
                              #(data-access-token/data-access-token
                                {:database-id 5 :table-ids #{30 10 20}}))]
      (is (= #{10 20 30} (set (keys (:sandbox token)))))
      (is (contains? (:sandbox token) 20)))))

(deftest data-access-token-unparseable-reads-as-nil-test
  (testing "an unparseable blob fails closed"
    (is (nil? (transform-out "{not json ][")))))
