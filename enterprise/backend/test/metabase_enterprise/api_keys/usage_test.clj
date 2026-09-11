(ns metabase-enterprise.api-keys.usage-test
  "Tests for the API-key usage write points — one lean `api_key_usage_log` row per
  API-key-authenticated request, plus the throttled `api_key.last_used_at` stamp. Exercises the
  `defenterprise` dispatch via the OSS entry points in `metabase.api-keys.usage`. Collection runs on
  every EE instance (`:feature :none`); PII is gated by `analytics-pii-retention-enabled` (itself
  `:audit-app`-gated). Rows are inserted from a Grouper batch queue, so every test that expects to
  read a row back forces `synchronous-batch-updates`."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.api-keys.usage :as ee.usage]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.usage :as usage]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- unique-route
  "A route template unique to one test, so rows can be found and cleaned up without colliding with
  anything else in the table."
  []
  (str "/api/usage-test/" (mt/random-name) "/:id"))

(defn- row-for [route]
  (t2/select-one :model/ApiKeyUsageLog :route_template route))

(defn- request-info
  "A complete `record-api-key-request!` input map, overridable per test."
  [route & {:as overrides}]
  (merge {:api-key-id     1234
          :user-id        (mt/user->id :rasta)
          :tenant-id      nil
          :route-template route
          :http-method    "GET"
          :status         200
          :duration-ms    12
          :user-agent     "curl/8.4.0"
          :ip-address     "203.0.113.7"}
         overrides))

;;; ------------------------------------------- record-api-key-request! --------------------------------------------

(deftest record-api-key-request!-writes-row-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                       analytics-pii-retention-enabled true]
      (let [route (unique-route)]
        (try
          (usage/record-api-key-request! (request-info route
                                                       :tenant-id 42
                                                       :http-method "POST"
                                                       :status 201))
          (let [row (row-for route)]
            (testing "non-PII columns"
              (is (= 1234 (:api_key_id row)))
              (is (= (mt/user->id :rasta) (:user_id row)))
              (is (= 42 (:tenant_id row)))
              (is (= "POST" (:http_method row)))
              (is (= 201 (:status row)))
              (is (= 12 (:duration_ms row)))
              (is (some? (:created_at row)))
              (is (= "curl" (:client_name row))))
            (testing "PII columns populated when retention is on"
              (is (= "curl/8.4.0" (:user_agent row)))
              (is (= "203.0.113.7" (:ip_address row)))))
          (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))

(deftest record-api-key-request!-pii-gate-test
  (testing "ip_address / user_agent are stored only when retention is on"
    (mt/with-premium-features #{:audit-app}
      (testing "retention on: PII columns populated"
        (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                           analytics-pii-retention-enabled true]
          (let [route (unique-route)]
            (try
              (usage/record-api-key-request! (request-info route))
              (let [row (row-for route)]
                (is (= "curl/8.4.0" (:user_agent row)))
                (is (= "203.0.113.7" (:ip_address row))))
              (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))
      (testing "retention off: the row is still written, PII columns stay null"
        (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                           analytics-pii-retention-enabled false]
          (let [route (unique-route)]
            (try
              (usage/record-api-key-request! (request-info route))
              (let [row (row-for route)]
                (is (some? row))
                (is (= 200 (:status row)))
                (is (nil? (:user_agent row)))
                (is (nil? (:ip_address row))))
              (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))))

(deftest record-api-key-request!-client-name-is-never-gated-test
  (testing "client_name is classified from user-agent and recorded even when PII retention is off"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                         analytics-pii-retention-enabled false]
        (let [route (unique-route)]
          (try
            (usage/record-api-key-request! (request-info route :user-agent "metabase-cli/1.2.3"))
            (let [row (row-for route)]
              (is (= "metabase-cli" (:client_name row)))
              (testing "but the raw user_agent stays gated"
                (is (nil? (:user_agent row)))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-request!-embedding-client-test
  (testing "embedding_client carries the raw X-Metabase-Client header, never gated, unlike client_name it's not classified"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                         analytics-pii-retention-enabled false]
        (let [route (unique-route)]
          (try
            (usage/record-api-key-request! (request-info route :embedding-client "embedding-sdk-react"))
            (is (= "embedding-sdk-react" (:embedding_client (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))
  (testing "absent when not passed — the common case for API-key traffic"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (usage/record-api-key-request! (request-info route))
            (is (nil? (:embedding_client (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-request!-truncates-embedding-client-test
  (testing "an over-long embedding_client is truncated to the column width so the row still records"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)
              long-value (apply str (repeat 300 \x))]
          (try
            (usage/record-api-key-request! (request-info route :embedding-client long-value))
            (is (= 255 (count (:embedding_client (row-for route)))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-request!-embedding-hostname-test
  (testing "embedding_hostname carries the parsed hostname, never gated"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                         analytics-pii-retention-enabled false]
        (let [route (unique-route)]
          (try
            (usage/record-api-key-request! (request-info route :embedding-hostname "example.com"))
            (is (= "example.com" (:embedding_hostname (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))
  (testing "absent when not passed"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (usage/record-api-key-request! (request-info route))
            (is (nil? (:embedding_hostname (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-request!-truncates-embedding-hostname-test
  (testing "an over-long embedding_hostname is truncated to the column width so the row still records"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)
              long-value (apply str (repeat 600 \x))]
          (try
            (usage/record-api-key-request! (request-info route :embedding-hostname long-value))
            (is (= 512 (count (:embedding_hostname (row-for route)))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-request!-unrecognized-user-agent-is-other-test
  (testing "an unrecognized or absent User-Agent classifies as \"other\""
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (usage/record-api-key-request! (request-info route :user-agent nil))
            (is (= "other" (:client_name (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-request!-truncates-route-template-test
  (testing "an over-long route_template is truncated to the column width so the row still records"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (apply str (unique-route) (repeat 300 \x))]
          (try
            (usage/record-api-key-request! (request-info route))
            (is (= 255 (count (:route_template (row-for (subs route 0 255))))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template (subs route 0 255)))))))))

(deftest record-api-key-request!-drops-incomplete-row-test
  (testing "a row missing a NOT NULL value is dropped rather than queued, so it can't sink its batch"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (is (nil? (usage/record-api-key-request! (request-info route :api-key-id nil))))
            (is (nil? (row-for route)))
            (testing "a complete row still records afterwards"
              (usage/record-api-key-request! (request-info route))
              (is (some? (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-request!-collection-runs-without-audit-app-test
  (testing "collection happens on any EE instance (:feature :none), but PII stays null without :audit-app"
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (usage/record-api-key-request! (request-info route))
            (let [row (row-for route)]
              (testing "non-PII row is written"
                (is (some? row))
                (is (= (mt/user->id :rasta) (:user_id row))))
              (testing "PII is null because retention can't be enabled without :audit-app"
                (is (nil? (:user_agent row)))
                (is (nil? (:ip_address row)))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-request!-is-best-effort-test
  (testing "a failed insert is swallowed and never propagates to the caller"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (mt/with-dynamic-fn-redefs [t2/insert! (fn [& _] (throw (ex-info "boom" {})))]
          (is (nil? (usage/record-api-key-request! (request-info (unique-route))))))))))

;;; ------------------------------------------ record-api-key-last-used! -------------------------------------------

(defn- last-used-at [api-key-id]
  (t2/select-one-fn :last_used_at :model/ApiKey :id api-key-id))

(defn- clear-last-used-at! [api-key-id]
  (t2/query {:update :api_key
             :where  [:= :id api-key-id]
             :set    {:last_used_at nil}}))

(deftest record-api-key-last-used!-stamps-and-throttles-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-keys/unhashed-key "mb_1234567890"
                                                   :name                   (mt/random-name)
                                                   :user_id                (mt/user->id :crowberto)
                                                   :creator_id             (mt/user->id :crowberto)
                                                   :updated_by_id          (mt/user->id :crowberto)}]
      (let [updated-at-before (t2/select-one-fn :updated_at :model/ApiKey :id api-key-id)]
        (ee.usage/reset-last-used-throttle!)
        (testing "the first call stamps last_used_at"
          (is (nil? (last-used-at api-key-id)))
          (usage/record-api-key-last-used! api-key-id)
          (is (some? (last-used-at api-key-id))))
        (testing "a second call inside the throttle window does not write"
          (clear-last-used-at! api-key-id)
          (usage/record-api-key-last-used! api-key-id)
          (is (nil? (last-used-at api-key-id))))
        (testing "once the throttle is cleared the next call writes again"
          (ee.usage/reset-last-used-throttle!)
          (usage/record-api-key-last-used! api-key-id)
          (is (some? (last-used-at api-key-id))))
        (testing "the stamp bypasses the model hooks, so updated_at never moves"
          (is (= updated-at-before
                 (t2/select-one-fn :updated_at :model/ApiKey :id api-key-id))))))))

(deftest record-api-key-last-used!-throttles-per-key-test
  (testing "the throttle is keyed by api key id — one hot key does not block another key's first write"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/ApiKey {key-1 :id} {::api-keys/unhashed-key "mb_1111111111"
                                                :name                   (mt/random-name)
                                                :user_id                (mt/user->id :crowberto)
                                                :creator_id             (mt/user->id :crowberto)
                                                :updated_by_id          (mt/user->id :crowberto)}
                     :model/ApiKey {key-2 :id} {::api-keys/unhashed-key "mb_2222222222"
                                                :name                   (mt/random-name)
                                                :user_id                (mt/user->id :crowberto)
                                                :creator_id             (mt/user->id :crowberto)
                                                :updated_by_id          (mt/user->id :crowberto)}]
        (ee.usage/reset-last-used-throttle!)
        (usage/record-api-key-last-used! key-1)
        (usage/record-api-key-last-used! key-2)
        (is (some? (last-used-at key-1)))
        (is (some? (last-used-at key-2)))))))

(deftest record-api-key-last-used!-is-best-effort-test
  (testing "a failed update is swallowed, and a nil id is ignored"
    (mt/with-premium-features #{}
      (ee.usage/reset-last-used-throttle!)
      (is (nil? (usage/record-api-key-last-used! nil)))
      (mt/with-dynamic-fn-redefs [t2/query (fn [& _] (throw (ex-info "boom" {})))]
        (is (nil? (usage/record-api-key-last-used! Integer/MAX_VALUE)))))))
