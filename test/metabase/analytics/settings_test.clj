(ns metabase.analytics.settings-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

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

(defn- stored-sdk-react-18-hosts []
  (json/decode+kw (t2/select-one-fn :value :model/Setting :key "sdk-react-18-hosts")))

(deftest record-sdk-react-18-host-test
  (mt/with-clock #t "2026-10-13T10:00:00Z[UTC]"
    (mt/with-temporary-setting-values [sdk-react-18-hosts nil]
      (testing "saves a host with today's UTC date"
        (analytics.settings/record-sdk-react-18-host! "app.example.com")
        (is (= [{:hostname "app.example.com", :last_seen "2026-10-13"}]
               (analytics.settings/sdk-react-18-hosts))))
      (testing "saves a host app without a hostname"
        (analytics.settings/record-sdk-react-18-host! nil)
        (is (= [{:hostname nil, :last_seen "2026-10-13"}
                {:hostname "app.example.com", :last_seen "2026-10-13"}]
               (analytics.settings/sdk-react-18-hosts))))
      (testing "does not write when the host is already saved today, e.g. by another server"
        (let [writes (atom 0)]
          (mt/with-dynamic-fn-redefs [setting/set! (fn [& _] (swap! writes inc))]
            (analytics.settings/record-sdk-react-18-host! "app.example.com"))
          (is (zero? @writes)))))))

(deftest sdk-react-18-hosts-expiry-test
  (mt/with-clock #t "2026-10-13T10:00:00Z[UTC]"
    (mt/with-temporary-setting-values [sdk-react-18-hosts [{:hostname "old.example.com", :last_seen "2026-10-09"}
                                                           {:hostname "recent.example.com", :last_seen "2026-10-10"}
                                                           {:hostname "app.example.com", :last_seen "2026-10-12"}]]
      (testing "only returns the hosts seen in the last 4 days, newest first"
        (is (= [{:hostname "app.example.com", :last_seen "2026-10-12"}
                {:hostname "recent.example.com", :last_seen "2026-10-10"}]
               (analytics.settings/sdk-react-18-hosts))))
      (testing "a write moves the host to today and removes the expired hosts"
        (analytics.settings/record-sdk-react-18-host! "app.example.com")
        (is (= [{:hostname "app.example.com", :last_seen "2026-10-13"}
                {:hostname "recent.example.com", :last_seen "2026-10-10"}]
               (stored-sdk-react-18-hosts)))))))

(deftest sdk-react-18-hosts-cap-test
  (mt/with-clock #t "2026-10-13T10:00:00Z[UTC]"
    (mt/with-temporary-setting-values [sdk-react-18-hosts (vec (for [i (range analytics.settings/sdk-react-18-hosts-max)]
                                                                 {:hostname  (str "host-" i ".example.com")
                                                                  :last_seen "2026-10-12"}))]
      (testing "keeps the newest hosts when it is full"
        (analytics.settings/record-sdk-react-18-host! "new.example.com")
        (let [hosts (stored-sdk-react-18-hosts)]
          (is (= analytics.settings/sdk-react-18-hosts-max (count hosts)))
          (is (= {:hostname "new.example.com", :last_seen "2026-10-13"} (first hosts)))
          (is (not-any? #(= "host-49.example.com" (:hostname %)) hosts)))))))

(deftest record-sdk-react-18-host-side-effects-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [sdk-react-18-hosts nil]
      (let [settings-last-updated #(t2/select-one-fn :value :model/Setting :key "settings-last-updated")
            before                (settings-last-updated)]
        (analytics.settings/record-sdk-react-18-host! "app.example.com")
        (is (seq (stored-sdk-react-18-hosts)))
        (testing "does not make every server reload its settings"
          (is (= before (settings-last-updated))))
        (testing "does not write an audit_log row"
          (is (not-any? #(= "sdk-react-18-hosts" (get-in % [:details :key]))
                        (t2/select :model/AuditLog :topic :setting-update))))))))

(deftest record-sdk-react-18-host-error-test
  (mt/with-temporary-setting-values [sdk-react-18-hosts nil]
    (testing "a failed write logs a warning and does not throw"
      (mt/with-log-messages-for-level [messages [metabase.analytics.settings :warn]]
        (mt/with-dynamic-fn-redefs [setting/set! (fn [& _] (throw (ex-info "boom" {})))]
          (is (nil? (analytics.settings/record-sdk-react-18-host! "app.example.com"))))
        (is (=? [{:level :warn, :message #"Failed to save a host.*"}]
                (messages)))))))

(deftest sdk-react-18-hosts-api-test
  (let [today (str (t/local-date (t/instant) (t/zone-id "UTC")))
        hosts [{:hostname "app.example.com", :last_seen today}]]
    (mt/with-temporary-setting-values [sdk-react-18-hosts hosts]
      (testing "admins can read it by key"
        (is (= hosts (mt/user-http-request :crowberto :get 200 "setting/sdk-react-18-hosts"))))
      (testing "non-admins cannot read it"
        (mt/user-http-request :rasta :get 403 "setting/sdk-react-18-hosts"))
      (testing "nobody can write it through the API"
        (mt/user-http-request :crowberto :put "setting/sdk-react-18-hosts" {:value []})
        (is (= hosts (analytics.settings/sdk-react-18-hosts))))
      (testing "it is left out of the bulk settings payloads"
        (is (not (contains? (mt/user-http-request :crowberto :get 200 "session/properties")
                            :sdk-react-18-hosts)))
        (is (not-any? #(= "sdk-react-18-hosts" (:key %))
                      (mt/user-http-request :crowberto :get 200 "setting")))))))
