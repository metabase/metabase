(ns metabase.analytics.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.test :as mt]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest instance-creation-test
  (let [original-value (t2/select-one-fn :value :model/Setting :key "instance-creation")]
    (try
      (testing "Instance creation timestamp is set only once when setting is first fetched"
        (t2/delete! :model/Setting :key "instance-creation")
        (mt/with-dynamic-fn-redefs [analytics.settings/first-user-creation (constantly nil)]
          (let [first-value (analytics.settings/instance-creation)]
            (Thread/sleep 10) ;; short sleep since java.time.Instant is not necessarily monotonic
            (is (= first-value
                   (analytics.settings/instance-creation))))))
      (testing "If a user already exists, we should use the first user's creation timestamp"
        (mt/with-test-user :crowberto
          (t2/delete! :model/Setting :key "instance-creation")
          (let [first-user-creation (:min (t2/select-one ['User [:%min.date_joined :min]]))
                instance-creation   (analytics.settings/instance-creation)]
            (is (= (u.date/format-rfc3339 first-user-creation)
                   instance-creation)))))
      (finally
        (when original-value
          (t2/update! :model/Setting {:key "instance-creation"} {:value original-value}))))))

(deftest metaplow-url-rejects-internal-hosts-test
  (testing "the collector URL is a server-side request target, so it may only point at an external host (SEC-764)"
    (mt/with-temporary-setting-values [metaplow-url nil]
      (doseq [url ["http://localhost:3000/api/send"
                   "http://127.0.0.1/api/send"
                   "http://169.254.169.254/api/send"       ; cloud instance metadata
                   "http://metadata.google.internal/api/send"
                   "http://10.0.0.1/api/send"
                   "http://[::1]/api/send"
                   "http://0.0.0.0/api/send"
                   "http://100.64.0.1/api/send"            ; CGNAT
                   "file:///etc/passwd"                     ; not an http(s) URL at all
                   "not a url"]]
        (testing url
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"Invalid Metaplow collector URL"
               (analytics.settings/metaplow-url! url)))
          (is (nil? (analytics.settings/metaplow-url))
              "a rejected URL must not be stored")))))
  (testing "external collectors, and clearing the setting, still work"
    (mt/with-temporary-setting-values [metaplow-url nil]
      (doseq [url ["https://product-analytics-ingestion.metabase.com/api/send"
                   ;; a host that does not resolve is allowed -- a DNS outage must not look like an
                   ;; internal address, and the connection-time resolver is the real gate anyway
                   "http://fake-metaplow/api/send"]]
        (analytics.settings/metaplow-url! url)
        (is (= url (analytics.settings/metaplow-url))))
      (analytics.settings/metaplow-url! nil)
      (is (nil? (analytics.settings/metaplow-url)))
      (testing "a blank URL clears the setting rather than storing \"\", which reads as truthy to
               `metaplow-tracking-enabled`"
        (analytics.settings/metaplow-url! "https://collector.example.com/api/send")
        (analytics.settings/metaplow-url! "   ")
        (is (nil? (analytics.settings/metaplow-url)))))))

(deftest analytics-pii-retention-enabled-feature-gate-test
  (testing "analytics-pii-retention-enabled is gated behind the :audit-app premium feature"
    (testing "with :audit-app, the setting can be read and written"
      (mt/with-premium-features #{:audit-app}
        (mt/with-temporary-setting-values [analytics-pii-retention-enabled false]
          (analytics.settings/analytics-pii-retention-enabled! true)
          (is (true? (analytics.settings/analytics-pii-retention-enabled))))))
    (testing "without :audit-app, reads return the default and writes throw"
      (mt/with-premium-features #{}
        (is (false? (analytics.settings/analytics-pii-retention-enabled)))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Setting analytics-pii-retention-enabled is not enabled because feature :audit-app is not available"
             (analytics.settings/analytics-pii-retention-enabled! true)))))))
