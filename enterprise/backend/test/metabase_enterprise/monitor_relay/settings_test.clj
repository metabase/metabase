(ns metabase-enterprise.monitor-relay.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.settings :as relay.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel parse-url-test
  (testing "the URL splits at its last /ingest/ into the base and the token"
    (is (= {:base "http://host.docker.internal:8080", :token "kq3D-x_9"}
           (relay.settings/parse-url "http://host.docker.internal:8080/ingest/kq3D-x_9")))
    (is (= {:base "https://monitor.example.com/ingest/sub", :token "abc"}
           (relay.settings/parse-url "https://monitor.example.com/ingest/sub/ingest/abc"))))
  (testing "whitespace and trailing slashes do not matter"
    (is (= {:base "https://m.example.com", :token "abc"}
           (relay.settings/parse-url "  https://m.example.com/ingest/abc/\n"))))
  (testing "anything else is not an ingestion URL"
    (are [s] (nil? (relay.settings/parse-url s))
      nil
      ""
      42
      "https://m.example.com"
      "https://m.example.com/ingest/"
      "https://m.example.com/ingest/a/b"
      "https://m.example.com/ingest/abc?x=1"
      "https://m.example.com/ingest/a b"
      "ftp://m.example.com/ingest/abc"
      "m.example.com/ingest/abc"
      "/ingest/abc")))

(deftest ^:parallel definition-test
  (testing "the URL holds a credential: admins only, masked, encrypted, never exported, audited without its value"
    (is (=? {:visibility         :admin
             :sensitive?         true
             :encryption         :when-encryption-key-set
             :export?            false
             :audit              :no-value
             :can-read-from-env? true}
            (setting/resolve-setting :metabase-monitor-url)))))

(def ^:private url "http://monitor:8080/ingest/the-secret-token")

(def ^:private refusal #"This is not a Metabase Monitor ingestion URL\..*<base>/ingest/<token>")

(deftest setter-test
  (mt/with-temporary-setting-values [metabase-monitor-url nil]
    (testing "a URL is stored as the relay reads it"
      (relay.settings/metabase-monitor-url! (str "  " url "/\n"))
      (is (= url (relay.settings/metabase-monitor-url))))
    (testing "anything else is a 400, and the URL stays"
      (doseq [bad ["http://monitor:8080/the-secret-token" "not a url" 42]]
        (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo refusal
                                      (relay.settings/metabase-monitor-url! bad)))]
          (is (= 400 (:status-code (ex-data e))))))
      (is (= url (relay.settings/metabase-monitor-url))))
    (testing "the masked value that reading it gives changes nothing"
      (relay.settings/metabase-monitor-url! "**********en")
      (is (= url (relay.settings/metabase-monitor-url))))
    (testing "a blank value clears it"
      (relay.settings/metabase-monitor-url! "  ")
      (is (nil? (relay.settings/metabase-monitor-url)))
      (relay.settings/metabase-monitor-url! url)
      (relay.settings/metabase-monitor-url! nil)
      (is (nil? (relay.settings/metabase-monitor-url))))))

(deftest api-test
  (mt/with-temp-env-var-value! [mb-metabase-monitor-url nil]
    (mt/with-temporary-setting-values [metabase-monitor-url nil]
      (testing "an admin sets it through the settings API, and reads it back masked"
        (mt/user-http-request :crowberto :put 204 "setting/metabase-monitor-url" {:value url})
        (is (= url (relay.settings/metabase-monitor-url)))
        (is (= "**********en" (mt/user-http-request :crowberto :get 200 "setting/metabase-monitor-url")))
        (is (=? {:value "**********en", :is_env_setting false, :env_name "MB_METABASE_MONITOR_URL"}
                (some #(when (= "metabase-monitor-url" (:key %)) %)
                      (mt/user-http-request :crowberto :get 200 "setting")))))
      (testing "a malformed URL is a 400 with the reason"
        (is (re-find refusal (mt/user-http-request :crowberto :put 400 "setting/metabase-monitor-url"
                                                   {:value "http://monitor:8080/x"})))
        (is (= url (relay.settings/metabase-monitor-url))))
      (testing "other users can neither read nor write it"
        (mt/user-http-request :rasta :get 403 "setting/metabase-monitor-url")
        (mt/user-http-request :rasta :put 403 "setting/metabase-monitor-url" {:value nil})
        (is (= url (relay.settings/metabase-monitor-url)))))))

(deftest env-test
  (mt/with-temporary-setting-values [metabase-monitor-url url]
    (mt/with-temp-env-var-value! [mb-metabase-monitor-url "http://env:8080/ingest/env-token"]
      (testing "the environment variable wins over the saved URL"
        (is (= "http://env:8080/ingest/env-token" (relay.settings/metabase-monitor-url))))
      (testing "the API shows neither, and says the environment sets it"
        (is (nil? (mt/user-http-request :crowberto :get 204 "setting/metabase-monitor-url")))
        (is (=? {:value nil, :is_env_setting true}
                (some #(when (= "metabase-monitor-url" (:key %)) %)
                      (mt/user-http-request :crowberto :get 200 "setting"))))))))

(deftest audit-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temporary-setting-values [metabase-monitor-url nil]
      (testing "a change is audited without the URL"
        (mt/user-http-request :crowberto :put 204 "setting/metabase-monitor-url" {:value url})
        (is (= {:key "metabase-monitor-url"}
               (:details (mt/latest-audit-log-entry :setting-update))))))))
