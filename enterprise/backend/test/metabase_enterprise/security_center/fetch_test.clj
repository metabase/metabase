(ns metabase-enterprise.security-center.fetch-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(defn- make-advisory
  "Build a minimal advisory map matching `parse-advisory` output. `overrides` are merged in."
  [advisory-id & {:as overrides}]
  (merge {:advisory_id       advisory-id
          :severity          "high"
          :title             (str "Advisory " advisory-id)
          :description       "Test advisory"
          :remediation       "Upgrade"
          :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
          :matching_query    nil
          :published_at      #t "2026-03-24T00:00:00Z"
          :updated_at        #t "2026-03-24T00:00:00Z"}
         overrides))

(deftest sync-advisories-inserts-new-test
  (mt/with-model-cleanup [:model/SecurityAdvisory]
    (with-redefs [fetch/fetch-advisories-from-store (constantly [(make-advisory "SC-FETCH-001")])]
      (fetch/sync-advisories!)
      (let [row (t2/select-one :model/SecurityAdvisory :advisory_id "SC-FETCH-001")]
        (is (some? row))
        (is (=? {:advisory_id  "SC-FETCH-001"
                 :match_status :unknown
                 :fetched_at   some?}
                row))))))

(deftest sync-advisories-updates-existing-test
  (mt/with-temp [:model/SecurityAdvisory _existing
                 (make-advisory "SC-FETCH-002" :severity "low" :title "Old title" :match_status "active"
                                :published_at #t "2026-03-24T00:00:00Z" :updated_at #t "2026-03-24T00:00:00Z")]
    (with-redefs [fetch/fetch-advisories-from-store
                  (constantly [(make-advisory "SC-FETCH-002" :title "New title" :severity "critical")])]
      (fetch/sync-advisories!)
      (is (=? {:title        "New title"
               :severity     :critical
               :match_status :active}
              (t2/select-one :model/SecurityAdvisory :advisory_id "SC-FETCH-002"))))))

(deftest sync-advisories-preserves-acknowledgement-test
  (mt/with-temp [:model/User {user-id :id} {:is_superuser true}
                 :model/SecurityAdvisory _existing
                 (make-advisory "SC-FETCH-003"
                                :match_status    "active"
                                :published_at    #t "2026-03-24T00:00:00Z"
                                :updated_at      #t "2026-03-24T00:00:00Z"
                                :acknowledged_by user-id
                                :acknowledged_at #t "2026-03-25T00:00:00Z")]
    (with-redefs [fetch/fetch-advisories-from-store
                  (constantly [(make-advisory "SC-FETCH-003" :title "Updated title")])]
      (fetch/sync-advisories!)
      (is (=? {:title           "Updated title"
               :acknowledged_by some?
               :acknowledged_at some?}
              (t2/select-one :model/SecurityAdvisory :advisory_id "SC-FETCH-003"))))))

(defn- make-json-advisory
  "Build a JSON-shaped advisory map (as it arrives from the store API, before parsing).
   Uses string severity and `id` instead of `advisory_id`."
  [advisory-id & {:as overrides}]
  (merge {"id"                advisory-id
          "severity"          "high"
          "title"             (str "Advisory " advisory-id)
          "description"       "Test advisory"
          "remediation"       "Upgrade"
          "affected_versions" [{"min" "0.1.0" "fixed" "99.99.99"}]
          "matching_query"    nil
          "published_at"      "2026-03-24T00:00:00Z"
          "updated_at"        "2026-03-24T00:00:00Z"
          "advisory_url"      nil}
         overrides))

(defn- fake-store-response
  "Build a ring-style HTTP response whose body is JSON containing the given advisories."
  [advisories]
  {:status 200
   :body   (json/encode {"advisories" advisories})})

(deftest fetch-advisories-from-json-test
  (testing "full pipeline: JSON response → schema validation → EDN parsing → upsert"
    (let [query-edn "{:select [1] :from [:core_user] :where [:= :email \"x\"] :limit 1}"
          advisory  (make-json-advisory "SC-2026-001"
                                        "matching_query" {"default" query-edn})]
      (mt/with-model-cleanup [:model/SecurityAdvisory]
        (with-redefs [http/get                                      (constantly (fake-store-response [advisory]))
                      premium-features/premium-embedding-token      (constantly "fake-token")
                      premium-features/site-uuid-for-premium-features-token-checks (constantly "fake-uuid")]
          (fetch/sync-advisories!)
          (let [row (t2/select-one :model/SecurityAdvisory :advisory_id "SC-2026-001")]
            (is (some? row))
            (is (= {:default {:select [1] :from [:core_user] :where [:= :email "x"] :limit 1}}
                   (:matching_query row)))
            (is (=? {:advisory_id "SC-2026-001"
                     :severity    :high
                     :title       "Advisory SC-2026-001"}
                    row))))))))

(deftest sync-advisories-stores-updated-at-test
  (mt/with-model-cleanup [:model/SecurityAdvisory]
    (with-redefs [fetch/fetch-advisories-from-store
                  (constantly [(make-advisory "SC-UPD-001" :updated_at #t "2026-04-01T12:00:00Z")])]
      (fetch/sync-advisories!)
      (let [row (t2/select-one :model/SecurityAdvisory :advisory_id "SC-UPD-001")]
        (is (some? (:updated_at row)))
        (is (not= (:published_at row) (:updated_at row)))))))

(deftest sync-advisories-updates-updated-at-on-resync-test
  (testing "updated_at is refreshed when an existing advisory is re-synced"
    (mt/with-temp [:model/SecurityAdvisory _
                   (make-advisory "SC-UPD-003" :match_status "unknown" :published_at #t "2026-03-24T00:00:00Z" :updated_at #t "2026-03-24T00:00:00Z")]
      (with-redefs [fetch/fetch-advisories-from-store
                    (constantly [(make-advisory "SC-UPD-003" :updated_at #t "2026-04-02T08:00:00Z")])]
        (fetch/sync-advisories!)
        (is (=? {:updated_at some?}
                (t2/select-one :model/SecurityAdvisory :advisory_id "SC-UPD-003")))
        (is (not= #t "2026-03-24T00:00:00Z"
                  (:updated_at (t2/select-one :model/SecurityAdvisory :advisory_id "SC-UPD-003"))))))))

(deftest fetch-rejects-non-select-matching-query-test
  (testing "matching_query with mutation keys is rejected during sync"
    (doseq [[label query-edn] [["insert"       "{:insert-into :core_user :values [{:email \"x\"}]}"]
                               ["delete"       "{:delete-from :core_user :where [:= :id 1]}"]
                               ["update"       "{:update :core_user :set {:email \"x\"} :where [:= :id 1]}"]
                               ["truncate"     "{:truncate :core_user}"]
                               ["drop-table"   "{:drop-table :core_user}"]
                               ["no-select"    "{:from [:core_user]}"]
                               ["not-a-map"    "[:select 1]"]]]
      (testing label
        (let [advisory (make-json-advisory (str "SC-BAD-" label)
                                           "matching_query" {"default" query-edn})]
          (mt/with-model-cleanup [:model/SecurityAdvisory]
            (with-redefs [http/get                                                    (constantly (fake-store-response [advisory]))
                          premium-features/premium-embedding-token                    (constantly "fake-token")
                          premium-features/site-uuid-for-premium-features-token-checks (constantly "fake-uuid")]
              ;; sync should not throw — error is caught per-advisory
              (fetch/sync-advisories!)
              (testing "advisory was NOT inserted"
                (is (nil? (t2/select-one :model/SecurityAdvisory :advisory_id (str "SC-BAD-" label))))))))))))

(deftest fetch-allows-valid-select-queries-test
  (doseq [[label query-edn] [["subquery"  "{:select [1] :from [{:select [:id] :from [:core_user]}] :limit 1}"]
                             ["cte"       "{:with [[:active_users {:select [:id] :from [:core_user]
                                             :where [:= :is_active true]}]] :select [1] :from [:active_users] :limit 1}"]]]
    (testing label
      (let [advisory (make-json-advisory (str "SC-OK-" label)
                                         "matching_query" {"default" query-edn})]
        (mt/with-model-cleanup [:model/SecurityAdvisory]
          (with-redefs [http/get                                                    (constantly (fake-store-response [advisory]))
                        premium-features/premium-embedding-token                    (constantly "fake-token")
                        premium-features/site-uuid-for-premium-features-token-checks (constantly "fake-uuid")]
            (fetch/sync-advisories!)
            (is (some? (t2/select-one :model/SecurityAdvisory :advisory_id (str "SC-OK-" label))))))))))

(deftest sync-advisories-handles-fetch-error-test
  (testing "network error doesn't throw"
    (with-redefs [fetch/fetch-advisories-from-store (fn [] (throw (Exception. "connection refused")))]
      (is (nil? (fetch/sync-advisories!))))))

(deftest sync-advisories-handles-upsert-error-test
  (testing "error on one advisory doesn't block others"
    (mt/with-model-cleanup [:model/SecurityAdvisory]
      (with-redefs [fetch/fetch-advisories-from-store
                    (constantly [(make-advisory "SC-FETCH-BAD" :severity "not-a-valid-severity!!!")
                                 (make-advisory "SC-FETCH-GOOD")])]
        (fetch/sync-advisories!)
        (testing "good advisory was still inserted"
          (is (some? (t2/select-one :model/SecurityAdvisory :advisory_id "SC-FETCH-GOOD"))))))))
