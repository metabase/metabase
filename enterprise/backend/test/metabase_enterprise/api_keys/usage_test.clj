(ns metabase-enterprise.api-keys.usage-test
  "Tests for [[metabase.api-keys.usage/record-api-key-usage!]] — one lean `api_key_usage_log` row per
  API-key-authenticated request, plus the `api_key.last_used_at` stamp. Exercises the `defenterprise`
  dispatch via the OSS entry point in `metabase.api-keys.usage`. Collection runs on every EE instance
  (`:feature :none`); PII is gated by `analytics-pii-retention-enabled` (itself `:audit-app`-gated).
  Both writes coalesce in memory between scheduled flushes — [[record!]] forces the usage-log flush on
  every call; `last_used_at` tests call the private `flush-last-used-at!` explicitly, since some of
  them specifically check the pre-flush state. `synchronous-batch-updates` no longer applies to either
  write — it only ever affected Grouper, which neither path uses anymore."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase-enterprise.api-keys.usage :as ee-usage]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.db :as api-keys.db]
   [metabase.api-keys.usage :as usage]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
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

(defn- last-used-at [api-key-id]
  (t2/select-one-fn :last_used_at :model/ApiKey :id api-key-id))

(defn- request-info
  "A complete [[record!]] input map, overridable per test."
  [route & {:as overrides}]
  (merge {:api-key-id     1234
          :user-id        (mt/user->id :rasta)
          :creator-id     (mt/user->id :crowberto)
          :route-template route
          :http-method    "GET"
          :status         200
          :duration-ms    12
          :user-agent     "curl/8.4.0"
          :ip-address     "203.0.113.7"}
         overrides))

(defn- record!
  "Translates a flat [[request-info]] map into the real `(request response extra-info)` shape the
  recorder now takes, invokes it, then forces the usage-log row to flush — it coalesces in memory
  between scheduled flushes, so a row written moments ago may not be on disk yet. (`last_used_at` is
  not flushed here — tests that need it call the private `flush-last-used-at!` explicitly, since some
  of them specifically check the pre-flush state.)"
  [{:keys [api-key-id user-id creator-id route-template http-method status duration-ms occurred-at
           user-agent ip-address embedding-client embedding-hostname]}]
  (usage/record-api-key-usage!
   {:api-key-id         api-key-id
    :metabase-user-id   user-id
    :api-key-creator-id creator-id
    :request-method     (some-> http-method u/lower-case-en keyword)
    :headers          (cond-> {}
                        user-agent         (assoc "user-agent" user-agent)
                        ip-address         (assoc "x-forwarded-for" ip-address)
                        embedding-client   (assoc "x-metabase-client" embedding-client)
                        embedding-hostname (assoc "x-metabase-embed-referrer" (str "https://" embedding-hostname)))}
   {:status status}
   {:route-template route-template
    :duration-ms    duration-ms
    :occurred-at    occurred-at})
  (#'ee-usage/flush-usage-logs!))

;;; ------------------------------------------- usage log row --------------------------------------------

(deftest record-api-key-usage!-writes-row-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                       analytics-pii-retention-enabled true]
      (let [route (unique-route)]
        (try
          (record! (request-info route
                                 :http-method "POST"
                                 :status 201))
          (let [row (row-for route)]
            (testing "non-PII columns"
              (is (= 1234 (:api_key_id row)))
              (is (= (mt/user->id :rasta) (:user_id row)))
              (is (= (mt/user->id :crowberto) (:created_by_id row)))
              (is (= "POST" (:http_method row)))
              (is (= 201 (:status row)))
              (is (= 12 (:duration_ms row)))
              (is (some? (:occurred_at row)))
              (is (= "curl" (:client_name row))))
            (testing "PII columns populated when retention is on"
              (is (= "curl/8.4.0" (:user_agent row)))
              (is (= "203.0.113.7" (:ip_address row)))))
          (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))

(deftest record-api-key-usage!-occurred-at-is-caller-supplied-test
  (testing "occurred_at reflects the caller's timestamp, not whenever the batch happens to flush"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route       (unique-route)
              ;; truncated to microseconds to match real DB storage precision; H2 alone preserves nanoseconds.
              occurred-at (-> (t/instant) (t/minus (t/hours 3)) (t/truncate-to :micros)
                              (t/offset-date-time (t/zone-offset 0)))]
          (try
            (record! (request-info route :occurred-at occurred-at))
            (is (= occurred-at (:occurred_at (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-pii-gate-test
  (testing "ip_address / user_agent are stored only when retention is on"
    (mt/with-premium-features #{:audit-app}
      (testing "retention on: PII columns populated"
        (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                           analytics-pii-retention-enabled true]
          (let [route (unique-route)]
            (try
              (record! (request-info route))
              (let [row (row-for route)]
                (is (= "curl/8.4.0" (:user_agent row)))
                (is (= "203.0.113.7" (:ip_address row))))
              (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))
      (testing "retention off: the row is still written, PII columns stay null"
        (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                           analytics-pii-retention-enabled false]
          (let [route (unique-route)]
            (try
              (record! (request-info route))
              (let [row (row-for route)]
                (is (some? row))
                (is (= 200 (:status row)))
                (is (nil? (:user_agent row)))
                (is (nil? (:ip_address row))))
              (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))))

(deftest record-api-key-usage!-client-name-is-never-gated-test
  (testing "client_name is classified from user-agent and recorded even when PII retention is off"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                         analytics-pii-retention-enabled false]
        (let [route (unique-route)]
          (try
            (record! (request-info route :user-agent "metabase-cli/1.2.3"))
            (let [row (row-for route)]
              (is (= "metabase-cli" (:client_name row)))
              (testing "but the raw user_agent stays gated"
                (is (nil? (:user_agent row)))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-embedding-client-test
  (testing "embedding_client carries the raw X-Metabase-Client header, never gated, unlike client_name it's not classified"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                         analytics-pii-retention-enabled false]
        (let [route (unique-route)]
          (try
            (record! (request-info route :embedding-client "embedding-sdk-react"))
            (is (= "embedding-sdk-react" (:embedding_client (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))
  (testing "absent when not passed — the common case for API-key traffic"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (record! (request-info route))
            (is (nil? (:embedding_client (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-truncates-embedding-client-test
  (testing "an over-long embedding_client is truncated to the column width so the row still records"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)
              long-value (apply str (repeat 300 \x))]
          (try
            (record! (request-info route :embedding-client long-value))
            (is (= 255 (count (:embedding_client (row-for route)))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-embedding-hostname-test
  (testing "embedding_hostname carries the parsed hostname, never gated"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates       true
                                         analytics-pii-retention-enabled false]
        (let [route (unique-route)]
          (try
            (record! (request-info route :embedding-hostname "example.com"))
            (is (= "example.com" (:embedding_hostname (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))
  (testing "absent when not passed"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (record! (request-info route))
            (is (nil? (:embedding_hostname (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-truncates-embedding-hostname-test
  (testing "an over-long embedding_hostname is truncated to the column width so the row still records"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)
              long-value (apply str (repeat 600 \x))]
          (try
            (record! (request-info route :embedding-hostname long-value))
            (is (= 512 (count (:embedding_hostname (row-for route)))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-unrecognized-user-agent-is-other-test
  (testing "an unrecognized or absent User-Agent classifies as \"other\""
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (record! (request-info route :user-agent nil))
            (is (= "other" (:client_name (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-truncates-route-template-test
  (testing "an over-long route_template is truncated to the column width so the row still records"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (apply str (unique-route) (repeat 300 \x))]
          (try
            (record! (request-info route))
            (is (= 255 (count (:route_template (row-for (subs route 0 255))))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template (subs route 0 255)))))))))

(deftest record-api-key-usage!-unmatched-route-is-recorded-test
  (testing "a nil route-template is recorded with the unmatched sentinel, not dropped"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        ;; a dedicated api-key-id, since the stored route_template is the sentinel rather than
        ;; `route` — this test can't find its row by route like the others do
        (let [api-key-id 424242]
          (try
            (record! (request-info (unique-route) :api-key-id api-key-id :route-template nil))
            (is (= "(unmatched)"
                   (:route_template (t2/select-one :model/ApiKeyUsageLog :api_key_id api-key-id))))
            (finally (t2/delete! :model/ApiKeyUsageLog :api_key_id api-key-id))))))))

(deftest record-api-key-usage!-drops-incomplete-log-row-test
  (testing "a row missing a NOT NULL value is dropped rather than queued, so it can't sink its batch"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (record! (request-info route :api-key-id nil))
            (is (nil? (row-for route)))
            (testing "a complete row still records afterwards"
              (record! (request-info route))
              (is (some? (row-for route))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-collection-runs-without-audit-app-test
  (testing "collection happens on any EE instance (:feature :none), but PII stays null without :audit-app"
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (let [route (unique-route)]
          (try
            (record! (request-info route))
            (let [row (row-for route)]
              (testing "non-PII row is written"
                (is (some? row))
                (is (= (mt/user->id :rasta) (:user_id row))))
              (testing "PII is null because retention can't be enabled without :audit-app"
                (is (nil? (:user_agent row)))
                (is (nil? (:ip_address row)))))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-log-row-is-best-effort-test
  (testing "a failed usage-log insert is swallowed and never propagates to the caller"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [synchronous-batch-updates true]
        (mt/with-dynamic-fn-redefs [t2/insert! (fn [& _] (throw (ex-info "boom" {})))]
          (is (nil? (record! (request-info (unique-route))))))))))

(deftest offer-usage-log!-drops-rows-once-full-test
  (testing "a full pending queue drops a new row rather than blocking the request thread for room"
    (let [pending  (deref #'ee-usage/pending-usage-logs)
          original @pending]
      (try
        (reset! pending (vec (repeat 500 {:dummy true})))
        (#'ee-usage/offer-usage-log! {:dummy true})
        (is (= 500 (count @pending)) "the queue was already at capacity, so the new row was dropped")
        (finally (reset! pending original))))))

;;; ------------------------------------------ last_used_at --------------------------------------------

(deftest record-api-key-usage!-stamps-last-used-at-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-keys/unhashed-key "mb_1234567890"
                                                   :name                   (mt/random-name)
                                                   :user_id                (mt/user->id :crowberto)
                                                   :creator_id             (mt/user->id :crowberto)
                                                   :updated_by_id          (mt/user->id :crowberto)}]
      (let [updated-at-before (t2/select-one-fn :updated_at :model/ApiKey :id api-key-id)
            route             (unique-route)]
        (try
          (is (nil? (last-used-at api-key-id)))
          (record! (request-info route :api-key-id api-key-id))
          (testing "not written until the next flush — coalesced in memory, not a synchronous write"
            (is (nil? (last-used-at api-key-id))))
          (#'ee-usage/flush-last-used-at!)
          (is (some? (last-used-at api-key-id)))
          (testing "the stamp bypasses the model hooks, so updated_at never moves"
            (is (= updated-at-before
                   (t2/select-one-fn :updated_at :model/ApiKey :id api-key-id))))
          (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))

(deftest record-api-key-usage!-coalesces-last-used-at-before-flush-test
  (testing "multiple events for the same key before a flush collapse to the max timestamp, one UPDATE"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-keys/unhashed-key "mb_3333333333"
                                                     :name                   (mt/random-name)
                                                     :user_id                (mt/user->id :crowberto)
                                                     :creator_id             (mt/user->id :crowberto)
                                                     :updated_by_id          (mt/user->id :crowberto)}]
        ;; truncated to microseconds to match real DB storage precision; H2 alone preserves nanoseconds.
        (let [now     #(-> (t/instant) (t/truncate-to :micros) (t/offset-date-time (t/zone-offset 0)))
              earlier (t/minus (now) (t/minutes 5))
              later   (now)
              route   (unique-route)]
          (try
            ;; out of order on purpose — the later timestamp must win regardless of arrival order
            (record! (request-info route :api-key-id api-key-id :occurred-at later))
            (record! (request-info route :api-key-id api-key-id :occurred-at earlier))
            (#'ee-usage/flush-last-used-at!)
            (is (= later (last-used-at api-key-id)))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-last-used-at-independent-per-key-test
  (testing "one key's event does not affect another key's last_used_at"
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
        (let [route (unique-route)]
          (try
            (record! (request-info route :api-key-id key-1))
            (#'ee-usage/flush-last-used-at!)
            (is (some? (last-used-at key-1)))
            (is (nil? (last-used-at key-2)))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest record-api-key-usage!-last-used-at-is-best-effort-test
  (testing "a nil id skips the write entirely"
    (mt/with-premium-features #{}
      (is (nil? (record! (request-info (unique-route) :api-key-id nil))))))
  (testing "a failed flush is swallowed rather than thrown"
    (mt/with-premium-features #{}
      (let [route (unique-route)]
        (try
          (record! (request-info route :api-key-id Integer/MAX_VALUE))
          (mt/with-dynamic-fn-redefs [t2/query (fn [& _] (throw (ex-info "boom" {})))]
            (is (nil? (#'ee-usage/flush-last-used-at!))))
          (finally (t2/delete! :model/ApiKeyUsageLog :route_template route)))))))

(deftest flush-last-used-at!-requeues-skipped-keys-test
  (testing "a key the DB layer skips (e.g. a busy row) goes back into the pending map, merged against
           newer arrivals rather than overwritten by the stale retry"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-keys/unhashed-key "mb_4444444444"
                                                     :name                   (mt/random-name)
                                                     :user_id                (mt/user->id :crowberto)
                                                     :creator_id             (mt/user->id :crowberto)
                                                     :updated_by_id          (mt/user->id :crowberto)}]
        ;; truncated to microseconds to match real DB storage precision; H2 alone preserves nanoseconds.
        (let [now     #(-> (t/instant) (t/truncate-to :micros) (t/offset-date-time (t/zone-offset 0)))
              earlier (now)
              later   (t/plus earlier (t/seconds 5))
              route   (unique-route)]
          (try
            (record! (request-info route :api-key-id api-key-id :occurred-at earlier))
            ;; simulate the lock step finding every key busy: nothing is actually written
            (mt/with-dynamic-fn-redefs [api-keys.db/update-api-keys-last-used-at! (fn [id->timestamp] id->timestamp)]
              (#'ee-usage/flush-last-used-at!))
            (is (nil? (last-used-at api-key-id)) "still pending — the redef simulated a busy row")
            ;; a fresher event lands before the key is retried
            (record! (request-info route :api-key-id api-key-id :occurred-at later))
            (#'ee-usage/flush-last-used-at!)
            (is (= later (last-used-at api-key-id)) "the retried write kept the newer of the two timestamps")
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

;;; -------------------------------------------- concurrency --------------------------------------------
;; Real threads, not `synchronous-batch-updates` — exercising the actual concurrent paths (many request
;; threads racing the in-memory queues, then a flush) rather than simulating them serially.

(deftest concurrent-last-used-at-stamps-keep-the-newest-timestamp-test
  (testing "many concurrent stamps for one key never lose the newest timestamp to a race"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-keys/unhashed-key "mb_5555555555"
                                                     :name                   (mt/random-name)
                                                     :user_id                (mt/user->id :crowberto)
                                                     :creator_id             (mt/user->id :crowberto)
                                                     :updated_by_id          (mt/user->id :crowberto)}]
        (let [route      (unique-route)
              ;; truncated to microseconds to match real DB storage precision; H2 alone preserves nanoseconds.
              base       (-> (t/instant) (t/truncate-to :micros) (t/offset-date-time (t/zone-offset 0)))
              n          50
              timestamps (mapv #(t/plus base (t/seconds %)) (range n))
              latest     (last timestamps)]
          (try
            (run! deref
                  (mapv (fn [ts] (future (record! (request-info route :api-key-id api-key-id :occurred-at ts))))
                        (shuffle timestamps)))
            (#'ee-usage/flush-last-used-at!)
            (is (= latest (last-used-at api-key-id)))
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))

(deftest concurrent-usage-log-offers-do-not-lose-rows-test
  (testing "many concurrent usage-log rows below capacity are never lost to a race in the pending queue"
    (mt/with-premium-features #{:audit-app}
      (let [api-key-id 636363
            n          50
            routes     (mapv #(str (unique-route) "-" %) (range n))]
        (try
          (run! deref (mapv (fn [route] (future (record! (request-info route :api-key-id api-key-id)))) routes))
          (#'ee-usage/flush-usage-logs!)
          (is (= n (t2/count :model/ApiKeyUsageLog :api_key_id api-key-id)))
          (finally (t2/delete! :model/ApiKeyUsageLog :api_key_id api-key-id)))))))

;;; ------------------------------------------ flush scheduling ------------------------------------------
;; JVM-local, not Quartz — see `start-flush!`'s docstring. Both writes coalesce in the same shared atoms
;; every other test in this namespace uses, so `stop-flush!` (called liberally below) is just the same
;; force-flush every other test already does, wrapped with idempotent executor teardown.

(deftest start-flush!-is-idempotent-test
  (testing "a second call shuts down the executor it just created instead of replacing the one already running"
    (#'ee-usage/stop-flush!) ; clean slate, in case an earlier boot already started the real flush loop
    (try
      (is (true? (#'ee-usage/start-flush!)) "the first call creates the executor")
      (is (false? (#'ee-usage/start-flush!)) "a second call is a no-op")
      (finally (#'ee-usage/stop-flush!)))))

(deftest stop-flush!-force-flushes-pending-state-test
  (testing "stop-flush! flushes a pending last_used_at stamp without waiting for the interval"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-keys/unhashed-key "mb_9999999999"
                                                     :name                   (mt/random-name)
                                                     :user_id                (mt/user->id :crowberto)
                                                     :creator_id             (mt/user->id :crowberto)
                                                     :updated_by_id          (mt/user->id :crowberto)}]
        (let [route (unique-route)]
          (try
            (is (nil? (last-used-at api-key-id)))
            (record! (request-info route :api-key-id api-key-id))
            (is (nil? (last-used-at api-key-id)) "not flushed yet — still coalescing")
            (#'ee-usage/stop-flush!)
            (is (some? (last-used-at api-key-id)) "stop-flush! force-flushed it")
            (finally (t2/delete! :model/ApiKeyUsageLog :route_template route))))))))
