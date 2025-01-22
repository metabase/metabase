(ns metabase-enterprise.api.gsheets-test
  (:require [clojure.test :refer [deftest is testing]]
            [metabase-enterprise.gsheets :as gsheets.api]
            [metabase.premium-features.token-check :as token-check]
            [metabase.test :as mt]
            [metabase.test.util :as tu])
  (:import [java.time
            LocalDate
            LocalTime
            ZoneId
            ZonedDateTime]))

(deftest ->config-good-test
  (testing "Both needed values are present and pulled from settings"
    (tu/with-temporary-setting-values
      [api-key "mb_api_key_123"
       store-api-url "http://store-api-url.com"]
      (is (= {:store-api-url "http://store-api-url.com", :api-key "mb_api_key_123"}
             (#'gsheets.api/->config))))))

(deftest ->config-missing-api-key-test
  (tu/with-temporary-setting-values
    [api-key nil
     store-api-url "http://store-api-url.com"]
    (is (thrown-with-msg?
         Exception
         #"Missing api-key."
         (#'gsheets.api/->config)))))

(deftest ->config-missing-both-test
  (tu/with-temporary-setting-values
    [api-key ""
     store-api-url nil]
    (is (thrown-with-msg?
         Exception
         #"Missing api-key."
         (#'gsheets.api/->config)))))

(defn- ->zdt
  ([date]
   (->zdt date 0))
  ([date time]
   (->zdt date time "UTC"))
  ([date time zone]
   (ZonedDateTime/of (LocalDate/of date 1 1)
                     (-> LocalTime/MIDNIGHT (.plusSeconds time))
                     (ZoneId/of zone))))

(deftest gsheets-calls-fail-when-missing-etl-connections
  (binding [token-check/*token-features* (constantly #{"attached-dwh"})]
    (is (->> (mt/user-http-request :crowberto :get 402 "ee/gsheets/service-account")
             :via
             first
             :message
             (re-find #"Google Sheets Integration is a paid feature")
             some?))))

(deftest gsheets-calls-fail-when-missing-attached-dwh
  (binding [token-check/*token-features* (constantly #{"etl-connections"})]
    (is (->> (mt/user-http-request :crowberto :get 402 "ee/gsheets/service-account")
             :via
             first
             :message
             (re-find #"Google Sheets Integration is a paid feature")
             some?))))

(deftest gsheets-calls-fail-when-non-superuser
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh"})]
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/gsheets/service-account")))))

(deftest gsheets-calls-fail-when-not-activated
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh"})]
    (is (= "Google Sheets integration is not enabled."
           (mt/user-http-request :crowberto :get 402 "ee/gsheets/service-account")))))

(deftest gsheets-calls-fail-when-there-is-no-mb-api-key
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh" "hosting"})]
    (mt/with-temporary-setting-values [api-key nil]
      (is (= "Google Sheets integration is not enabled."
             (mt/user-http-request :crowberto :get 402 "ee/gsheets/service-account"))))))

(deftest gsheets-calls-pass-when-activated-and-superuser
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh" "hosting"})]
    (mt/with-temporary-setting-values [api-key "non-blank"]
      (is (malli=
           [:map [:email [:maybe :string]]]
           (mt/user-http-request :crowberto :get 200 "ee/gsheets/service-account"))))))

(deftest sync-complete?-test
  (let [earlier-time (->zdt 2000)
        later-time (->zdt 2022)]

    (is (not (#'gsheets.api/sync-complete? {:status "initializing" :last-dwh-sync nil :last-gdrive-conn-sync nil}))
        "status must be active for sync to be complete")

    (is (not (#'gsheets.api/sync-complete? {:status "active" :last-dwh-sync nil :last-gdrive-conn-sync nil}))
        "sync is not complete when we don't get a last-gdrive-conn-sync time")

    (is (not (#'gsheets.api/sync-complete? {:status "active" :last-dwh-sync nil :last-gdrive-conn-sync earlier-time}))
        "sync is not complete when we don't get a last-dwh-sync time")

    (is (not (#'gsheets.api/sync-complete? {:status "active" :last-dwh-sync later-time :last-gdrive-conn-sync nil}))
        "sync is not complete when we don't get a last-gdrive-conn-sync time")

    (is (not (#'gsheets.api/sync-complete? {:status "active" :last-dwh-sync earlier-time :last-gdrive-conn-sync later-time}))
        "sync is not complete when the last dwh sync is before the last gdrive conn sync")

    (is (not (#'gsheets.api/sync-complete? {:status "active" :last-dwh-sync later-time :last-gdrive-conn-sync later-time}))
        "sync is not complete when the last dwh sync == the last gdrive conn sync")

    (is (#'gsheets.api/sync-complete? {:status "active" :last-dwh-sync later-time :last-gdrive-conn-sync earlier-time})
        "sync is complete when we get active status and the last local sync time is before current time")))
