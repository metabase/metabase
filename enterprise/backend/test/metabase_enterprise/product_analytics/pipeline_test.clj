(ns metabase-enterprise.product-analytics.pipeline-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.product-analytics.pipeline :as pipeline]
   [metabase-enterprise.product-analytics.token :as pa.token]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

;;; ============================================== Pure function tests ==============================================
;;; These tests are :parallel safe — no DB, no side-effects.

;;; -------------------------------------------------- Validation --------------------------------------------------

(deftest validate-payload-valid-pageview-test
  (is (= {:ok {:type "event" :payload {:website "abc" :url "https://example.com"}}}
         (pipeline/validate-payload {:type "event" :payload {:website "abc" :url "https://example.com"}}))))

(deftest validate-payload-valid-custom-event-test
  (is (:ok (pipeline/validate-payload
            {:type "event"
             :payload {:website "abc" :url "https://example.com" :name "click"}}))))

(deftest validate-payload-missing-type-test
  (is (= :validation/invalid-payload
         (:error (pipeline/validate-payload {:payload {:website "abc" :url "https://x.com"}})))))

(deftest validate-payload-identify-valid-test
  (testing "identify with website is valid"
    (is (:ok (pipeline/validate-payload
              {:type "identify"
               :payload {:website "abc"}}))))
  (testing "identify with data + distinct_id is valid"
    (is (:ok (pipeline/validate-payload
              {:type "identify"
               :payload {:website "abc"
                         :distinct_id "user-123"
                         :data {"plan" "pro"}}})))))

(deftest validate-payload-unknown-type-test
  (testing "truly unknown types like 'pageview' fail validation"
    (is (= :validation/invalid-payload
           (:error (pipeline/validate-payload {:type "pageview" :payload {:website "abc" :url "https://x.com"}}))))))

(deftest validate-payload-identify-missing-website-test
  (is (= :validation/invalid-payload
         (:error (pipeline/validate-payload {:type "identify" :payload {}})))))

(deftest validate-payload-identify-distinct-id-too-long-test
  (is (= :validation/invalid-payload
         (:error (pipeline/validate-payload
                  {:type "identify"
                   :payload {:website "abc"
                             :distinct_id (apply str (repeat 51 "x"))}})))))

(deftest validate-payload-missing-website-test
  (is (= :validation/invalid-payload
         (:error (pipeline/validate-payload {:type "event" :payload {:url "https://x.com"}})))))

(deftest validate-payload-missing-url-test
  (is (= :validation/invalid-payload
         (:error (pipeline/validate-payload {:type "event" :payload {:website "abc"}})))))

(deftest validate-payload-name-too-long-test
  (is (= :validation/invalid-payload
         (:error (pipeline/validate-payload
                  {:type "event"
                   :payload {:website "abc"
                             :url     "https://x.com"
                             :name    (apply str (repeat 51 "a"))}})))))

;;; ------------------------------------------------ Bot detection -------------------------------------------------

(deftest bot-known-bots-test
  (testing "known bot user-agent strings are detected"
    (doseq [ua ["Googlebot/2.1 (+http://www.google.com/bot.html)"
                "Mozilla/5.0 (compatible; Bingbot/2.0)"
                "facebookexternalhit/1.1"
                "LinkedInBot/1.0"
                "AhrefsBot/7.0"
                "Mozilla/5.0 HeadlessChrome/90.0"
                "curl/7.68.0"
                "python-requests/2.25.1"]]
      (testing ua
        (is (true? (pipeline/bot? ua)))))))

(deftest bot-real-browsers-pass-test
  (testing "real browser user-agents are NOT bots"
    (doseq [ua ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"]]
      (testing ua
        (is (false? (pipeline/bot? ua)))))))

(deftest bot-nil-blank-treated-as-bot-test
  (is (true? (pipeline/bot? nil)))
  (is (true? (pipeline/bot? "")))
  (is (true? (pipeline/bot? "  "))))

;;; ----------------------------------------------- Client info ----------------------------------------------------

(deftest parse-client-info-chrome-mac-test
  (let [ua     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        result (pipeline/parse-client-info ua)]
    (is (= "Chrome" (:browser result)))
    (is (= "OS X" (:os result)))
    (is (= "browser" (:device result)))))

(deftest parse-client-info-safari-iphone-test
  (let [ua     "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        result (pipeline/parse-client-info ua)]
    (is (= "Mobile Safari" (:browser result)))
    (is (some? (:os result)))
    (is (= "mobile" (:device result)))))

(deftest parse-client-info-nil-ua-test
  (let [result (pipeline/parse-client-info nil)]
    (is (nil? (:browser result)))
    (is (nil? (:os result)))
    (is (nil? (:device result)))))

;;; ------------------------------------------------ Geo extraction ------------------------------------------------

(deftest extract-geo-cloudflare-test
  (let [result (pipeline/extract-geo {"cf-ipcountry" "US"})]
    (is (= "US" (:country result)))))

(deftest extract-geo-vercel-full-test
  (let [result (pipeline/extract-geo {"x-vercel-ip-country"        "DE"
                                      "x-vercel-ip-country-region" "BE"
                                      "x-vercel-ip-city"           "Berlin"})]
    (is (= "DE" (:country result)))
    (is (= "BE" (:subdivision1 result)))
    (is (= "Berlin" (:city result)))))

(deftest extract-geo-cf-unknown-xx-test
  (let [result (pipeline/extract-geo {"cf-ipcountry" "XX"})]
    (is (nil? (:country result)))))

(deftest extract-geo-no-headers-test
  (let [result (pipeline/extract-geo {})]
    (is (nil? (:country result)))
    (is (nil? (:subdivision1 result)))
    (is (nil? (:city result)))))

(deftest extract-geo-cf-takes-priority-test
  (let [result (pipeline/extract-geo {"cf-ipcountry"         "US"
                                      "x-vercel-ip-country"  "DE"})]
    (is (= "US" (:country result)))))

;;; ----------------------------------------------- Session UUID ---------------------------------------------------

(deftest session-uuid-deterministic-test
  (let [uuid1 (pipeline/session-uuid "site1" "1.2.3.4" "Chrome" "secret" (t/zoned-date-time 2025 3 15 0 0 0 0 "UTC"))
        uuid2 (pipeline/session-uuid "site1" "1.2.3.4" "Chrome" "secret" (t/zoned-date-time 2025 3 15 0 0 0 0 "UTC"))]
    (is (= uuid1 uuid2))))

(deftest session-uuid-changes-with-month-test
  (let [uuid1 (pipeline/session-uuid "site1" "1.2.3.4" "Chrome" "secret" (t/zoned-date-time 2025 3 15 0 0 0 0 "UTC"))
        uuid2 (pipeline/session-uuid "site1" "1.2.3.4" "Chrome" "secret" (t/zoned-date-time 2025 4 15 0 0 0 0 "UTC"))]
    (is (not= uuid1 uuid2))))

(deftest session-uuid-changes-with-ip-test
  (let [uuid1 (pipeline/session-uuid "site1" "1.2.3.4" "Chrome" "secret" (t/zoned-date-time 2025 3 15 0 0 0 0 "UTC"))
        uuid2 (pipeline/session-uuid "site1" "5.6.7.8" "Chrome" "secret" (t/zoned-date-time 2025 3 15 0 0 0 0 "UTC"))]
    (is (not= uuid1 uuid2))))

(deftest session-uuid-format-test
  (let [uuid (pipeline/session-uuid "site1" "1.2.3.4" "Chrome" "secret" (t/zoned-date-time 2025 3 15 0 0 0 0 "UTC"))]
    (is (re-matches #"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" uuid))))

;;; ------------------------------------------------- Visit ID ----------------------------------------------------

(deftest visit-id-deterministic-test
  (let [vid1 (pipeline/visit-id "session-abc" "secret" (t/zoned-date-time 2025 3 15 10 0 0 0 "UTC"))
        vid2 (pipeline/visit-id "session-abc" "secret" (t/zoned-date-time 2025 3 15 10 30 0 0 "UTC"))]
    (is (= vid1 vid2))))

(deftest visit-id-changes-with-hour-test
  (let [vid1 (pipeline/visit-id "session-abc" "secret" (t/zoned-date-time 2025 3 15 10 0 0 0 "UTC"))
        vid2 (pipeline/visit-id "session-abc" "secret" (t/zoned-date-time 2025 3 15 11 0 0 0 "UTC"))]
    (is (not= vid1 vid2))))

(deftest visit-id-format-test
  (let [vid (pipeline/visit-id "session-abc" "secret" (t/zoned-date-time 2025 3 15 10 0 0 0 "UTC"))]
    (is (re-matches #"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" vid))))

;;; ------------------------------------------------ URL parsing ---------------------------------------------------

(deftest parse-url-full-with-utms-test
  (let [result (pipeline/parse-url "https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=abc123")]
    (is (= "/page" (:path result)))
    (is (= "google" (:utm_source result)))
    (is (= "cpc" (:utm_medium result)))
    (is (= "spring" (:utm_campaign result)))
    (is (= "abc123" (:gclid result)))))

(deftest parse-url-no-query-params-test
  (let [result (pipeline/parse-url "https://example.com/page")]
    (is (= "/page" (:path result)))
    (is (nil? (:query result)))
    (is (nil? (:utm_source result)))))

(deftest parse-url-path-truncation-test
  (let [long-path (str "https://example.com/" (apply str (repeat 600 "a")))
        result    (pipeline/parse-url long-path)]
    (is (= 500 (count (:path result))))))

(deftest parse-url-fbclid-test
  (let [result (pipeline/parse-url "https://example.com/?fbclid=fb123")]
    (is (= "fb123" (:fbclid result)))))

(deftest parse-url-percent-encoded-params-test
  (let [result (pipeline/parse-url "https://example.com/?utm_source=hello%20world")]
    (is (= "hello world" (:utm_source result)))))

(deftest parse-url-malformed-test
  (let [result (pipeline/parse-url "not a valid ://url with spaces")]
    (is (nil? (:path result)))
    (is (nil? (:query result)))))

;;; --------------------------------------------- Referrer parsing -------------------------------------------------

(deftest parse-referrer-full-test
  (let [result (pipeline/parse-referrer "https://google.com/search?q=test")]
    (is (= "/search" (:referrer_path result)))
    (is (= "q=test" (:referrer_query result)))
    (is (= "google.com" (:referrer_domain result)))))

(deftest parse-referrer-nil-test
  (let [result (pipeline/parse-referrer nil)]
    (is (nil? (:referrer_path result)))
    (is (nil? (:referrer_query result)))
    (is (nil? (:referrer_domain result)))))

(deftest parse-referrer-blank-test
  (let [result (pipeline/parse-referrer "")]
    (is (nil? (:referrer_path result)))))

;;; -------------------------------------------- Event properties --------------------------------------------------

(deftest build-event-properties-string-values-test
  (let [result (pipeline/build-event-properties {"color" "red"})]
    (is (= 1 (count result)))
    (is (= "color" (:data_key (first result))))
    (is (= "red" (:string_value (first result))))
    (is (= 1 (:data_type (first result))))))

(deftest build-event-properties-number-values-test
  (let [result (pipeline/build-event-properties {"count" 42})]
    (is (= 1 (count result)))
    (is (= 42 (:number_value (first result))))
    (is (= 2 (:data_type (first result))))))

(deftest build-event-properties-mixed-test
  (let [result (pipeline/build-event-properties {"name" "Alice" "age" 30})]
    (is (= 2 (count result)))
    (is (= #{1 2} (set (map :data_type result))))))

(deftest build-event-properties-nil-test
  (is (= [] (pipeline/build-event-properties nil))))

(deftest build-event-properties-empty-test
  (is (= [] (pipeline/build-event-properties {}))))

;;; ----------------------------------------- Session data rows ----------------------------------------------------

(deftest build-session-data-rows-string-values-test
  (let [result (pipeline/build-session-data-rows {"plan" "pro"})]
    (is (= 1 (count result)))
    (is (= "plan" (:data_key (first result))))
    (is (= "pro" (:string_value (first result))))
    (is (= 1 (:data_type (first result))))))

(deftest build-session-data-rows-number-values-test
  (let [result (pipeline/build-session-data-rows {"score" 99})]
    (is (= 1 (count result)))
    (is (= 99 (:number_value (first result))))
    (is (= 2 (:data_type (first result))))))

(deftest build-session-data-rows-mixed-test
  (let [result (pipeline/build-session-data-rows {"plan" "pro" "seats" 10})]
    (is (= 2 (count result)))
    (is (= #{1 2} (set (map :data_type result))))))

(deftest build-session-data-rows-nil-test
  (is (= [] (pipeline/build-session-data-rows nil))))

(deftest build-session-data-rows-empty-test
  (is (= [] (pipeline/build-session-data-rows {}))))

(deftest build-session-data-rows-no-session-id-test
  (testing "rows do not contain :session_id — caller adds it"
    (let [result (pipeline/build-session-data-rows {"k" "v"})]
      (is (not (contains? (first result) :session_id))))))

;;; ============================================ Integration tests =================================================
;;; These tests use the DB (mt/with-temp) — NOT :parallel safe.

(defn- make-body [site-uuid & {:keys [url name data referrer title screen language]
                               :or {url "https://example.com/page"}}]
  {:type    "event"
   :payload (cond-> {:website site-uuid :url url}
              name     (assoc :name name)
              data     (assoc :data data)
              referrer (assoc :referrer referrer)
              title    (assoc :title title)
              screen   (assoc :screen screen)
              language (assoc :language language))})

(defn- make-identify-body [site-uuid & {:keys [distinct-id data]}]
  {:type    "identify"
   :payload (cond-> {:website site-uuid}
              distinct-id (assoc :distinct_id distinct-id)
              data        (assoc :data data))})

(defn- make-ctx [& {:keys [user-agent ip headers token]
                    :or {user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                         ip         "1.2.3.4"
                         headers    {}}}]
  (cond-> {:user-agent user-agent :ip ip :headers headers}
    token (assoc :token token)))

(deftest process-event-pageview-success-test
  (testing "valid pageview body + context → success with correct shape"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [body   (make-body (:uuid site)
                              :url      "https://example.com/page?utm_source=google"
                              :referrer "https://google.com/search?q=test"
                              :title    "My Page"
                              :screen   "1920x1080"
                              :language "en-US")
            ctx    (make-ctx :headers {"cf-ipcountry" "US"})
            result (pipeline/process-event body ctx)]
        (is (nil? (:error result)) (str "Unexpected error: " (:message result)))
        ;; session-data
        (let [sd (:session-data result)]
          (is (string? (:session_uuid sd)))
          (is (= (:id site) (:site_id sd)))
          (is (= "Chrome" (:browser sd)))
          (is (= "1920x1080" (:screen sd)))
          (is (= "en-US" (:language sd)))
          (is (= "US" (:country sd))))
        ;; event-data
        (let [ed (get-in result [:event-data :event])]
          (is (= (:id site) (:site_id ed)))
          (is (string? (:visit_id ed)))
          (is (= 1 (:event_type ed)))
          (is (nil? (:event_name ed)))
          (is (= "/page" (:url_path ed)))
          (is (= "google" (:utm_source ed)))
          (is (= "/search" (:referrer_path ed)))
          (is (= "google.com" (:referrer_domain ed)))
          (is (= "My Page" (:page_title ed))))
        (is (= [] (get-in result [:event-data :properties])))))))

(deftest process-event-custom-event-success-test
  (testing "custom event with :name and :data → event_type 2 with properties"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [body   (make-body (:uuid site)
                              :name "button_click"
                              :data {"color" "blue" "count" 5})
            ctx    (make-ctx)
            result (pipeline/process-event body ctx)]
        (is (nil? (:error result)))
        (is (= 2 (get-in result [:event-data :event :event_type])))
        (is (= "button_click" (get-in result [:event-data :event :event_name])))
        (is (= 2 (count (get-in result [:event-data :properties]))))))))

(deftest process-event-unknown-site-test
  (testing "random UUID → :validation/unknown-site"
    (let [result (pipeline/process-event
                  (make-body (str (random-uuid)))
                  (make-ctx))]
      (is (= :validation/unknown-site (:error result))))))

(deftest process-event-bot-rejected-test
  (testing "Googlebot UA → :rejected/bot"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [result (pipeline/process-event
                    (make-body (:uuid site))
                    (make-ctx :user-agent "Googlebot/2.1"))]
        (is (= :rejected/bot (:error result)))))))

(deftest process-event-invalid-payload-test
  (testing "missing :type → :validation/invalid-payload"
    (let [result (pipeline/process-event
                  {:payload {:website "abc" :url "https://x.com"}}
                  (make-ctx))]
      (is (= :validation/invalid-payload (:error result))))))

(deftest process-event-archived-site-test
  (testing "archived site → :validation/unknown-site"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Archived" :uuid (str (random-uuid)) :archived true}]
      (let [result (pipeline/process-event
                    (make-body (:uuid site))
                    (make-ctx))]
        (is (= :validation/unknown-site (:error result)))))))

;;; --------------------------------------- Session cache tests (process-event) ------------------------------------

(deftest process-event-valid-jwt-uses-token-test
  (testing "valid JWT → uses token's session-id and visit-id, omits client-info/geo from session-data"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [token  (pa.token/create-session-token "cached-sess-uuid" "cached-visit-id" (:uuid site))
            body   (make-body (:uuid site) :url "https://example.com/page")
            ctx    (make-ctx :token token :headers {"cf-ipcountry" "US"})
            result (pipeline/process-event body ctx)]
        (is (nil? (:error result)) (str "Unexpected error: " (:message result)))
        (let [sd (:session-data result)]
          (is (= "cached-sess-uuid" (:session_uuid sd)))
          (is (= (:id site) (:site_id sd)))
          ;; client-info/geo keys should be absent (not nil) when cached
          (is (not (contains? sd :browser)))
          (is (not (contains? sd :os)))
          (is (not (contains? sd :device)))
          (is (not (contains? sd :country)))
          (is (not (contains? sd :subdivision1)))
          (is (not (contains? sd :city))))
        (let [ed (get-in result [:event-data :event])]
          (is (= "cached-visit-id" (:visit_id ed))))))))

(deftest process-event-expired-jwt-falls-back-test
  (testing "expired JWT (>24h) → falls back to normal hash resolution, client-info present"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [;; Create a token that is already expired by backdating the iat claim
            secret (pa.token/ensure-secret!)
            token  (jwt/sign {:session-id "old-sess"
                              :visit-id   "old-vid"
                              :website-id (:uuid site)
                              :iat        (- (quot (System/currentTimeMillis) 1000) 90000)}
                             secret
                             {:alg :hs256})
            body   (make-body (:uuid site) :url "https://example.com/page")
            ctx    (make-ctx :token token :headers {"cf-ipcountry" "US"})
            result (pipeline/process-event body ctx)]
        (is (nil? (:error result)))
        (let [sd (:session-data result)]
          ;; Should NOT use the expired token's session-id
          (is (not= "old-sess" (:session_uuid sd)))
          ;; client-info/geo keys should be present
          (is (contains? sd :browser))
          (is (contains? sd :country)))))))

(deftest process-event-tampered-jwt-falls-back-test
  (testing "tampered JWT → falls back to normal resolution"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [token  (str (pa.token/create-session-token "sess" "vid" (:uuid site)) "TAMPERED")
            body   (make-body (:uuid site) :url "https://example.com/page")
            ctx    (make-ctx :token token)
            result (pipeline/process-event body ctx)]
        (is (nil? (:error result)))
        (let [sd (:session-data result)]
          (is (not= "sess" (:session_uuid sd)))
          (is (contains? sd :browser)))))))

(deftest process-event-jwt-wrong-site-falls-back-test
  (testing "JWT with mismatched website-id → falls back to normal resolution"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [token  (pa.token/create-session-token "sess" "vid" "wrong-site-uuid")
            body   (make-body (:uuid site) :url "https://example.com/page")
            ctx    (make-ctx :token token)
            result (pipeline/process-event body ctx)]
        (is (nil? (:error result)))
        (let [sd (:session-data result)]
          (is (not= "sess" (:session_uuid sd)))
          (is (contains? sd :browser)))))))

;;; --------------------------------------- process-identify tests -------------------------------------------------

(deftest process-identify-success-with-data-test
  (testing "identify with data + distinct_id → success"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [body   (make-identify-body (:uuid site)
                                       :distinct-id "user-123"
                                       :data {"plan" "pro" "seats" 5})
            ctx    (make-ctx)
            result (pipeline/process-identify body ctx)]
        (is (nil? (:error result)) (str "Unexpected error: " (:message result)))
        (is (true? (:identify result)))
        (is (= "user-123" (:distinct-id result)))
        (let [sd (:session-data result)]
          (is (string? (:session_uuid sd)))
          (is (= (:id site) (:site_id sd))))
        (is (= 2 (count (:data-rows result))))
        (is (= #{1 2} (set (map :data_type (:data-rows result)))))))))

(deftest process-identify-minimal-test
  (testing "identify with only website → nil distinct-id, empty data-rows"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [body   (make-identify-body (:uuid site))
            ctx    (make-ctx)
            result (pipeline/process-identify body ctx)]
        (is (nil? (:error result)))
        (is (true? (:identify result)))
        (is (nil? (:distinct-id result)))
        (is (= [] (:data-rows result)))))))

(deftest process-identify-unknown-site-test
  (testing "unknown site → error"
    (let [result (pipeline/process-identify
                  (make-identify-body (str (random-uuid)))
                  (make-ctx))]
      (is (= :validation/unknown-site (:error result))))))

(deftest process-identify-bot-rejected-test
  (testing "bot UA → error"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [result (pipeline/process-identify
                    (make-identify-body (:uuid site))
                    (make-ctx :user-agent "Googlebot/2.1"))]
        (is (= :rejected/bot (:error result)))))))

(deftest process-identify-valid-jwt-test
  (testing "valid JWT → uses token's session-id"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [token  (pa.token/create-session-token "cached-sess" "cached-vid" (:uuid site))
            body   (make-identify-body (:uuid site) :distinct-id "user-456")
            ctx    (make-ctx :token token)
            result (pipeline/process-identify body ctx)]
        (is (nil? (:error result)))
        (is (= "cached-sess" (get-in result [:session-data :session_uuid])))))))

;;; --------------------------------------- process-payload tests --------------------------------------------------

(deftest process-payload-event-routes-test
  (testing "type=event routes correctly and has :event-data"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [body   (make-body (:uuid site))
            ctx    (make-ctx)
            result (pipeline/process-payload body ctx)]
        (is (nil? (:error result)))
        (is (some? (:event-data result)))))))

(deftest process-payload-identify-routes-test
  (testing "type=identify routes correctly and has :identify true"
    (mt/with-temp [:model/ProductAnalyticsSite site {:name "Test Site" :uuid (str (random-uuid))}]
      (let [body   (make-identify-body (:uuid site))
            ctx    (make-ctx)
            result (pipeline/process-payload body ctx)]
        (is (nil? (:error result)))
        (is (true? (:identify result)))))))

(deftest process-payload-unknown-type-test
  (testing "unknown type → :validation/invalid-payload"
    (let [result (pipeline/process-payload {:type "pageview" :payload {:website "abc"}} (make-ctx))]
      (is (= :validation/invalid-payload (:error result))))))

(deftest process-payload-missing-type-test
  (testing "missing type → :validation/invalid-payload"
    (let [result (pipeline/process-payload {:payload {:website "abc"}} (make-ctx))]
      (is (= :validation/invalid-payload (:error result))))))
