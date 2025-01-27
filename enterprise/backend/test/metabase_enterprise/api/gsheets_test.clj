(ns metabase-enterprise.api.gsheets-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer [deftest is testing]]
            [metabase-enterprise.gsheets :as gsheets.api]
            [metabase-enterprise.harbormaster.client :as hm.client]
            [metabase.premium-features.token-check :as token-check]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [toucan2.core :as t2]
            [java-time.api :as t])
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

(defn- ->zdt
  ([date] (->zdt date 0))
  ([date time] (->zdt date time "UTC"))
  ([date time zone] (ZonedDateTime/of (LocalDate/of date 1 1)
                                      (-> LocalTime/MIDNIGHT (.plusSeconds time))
                                      (ZoneId/of zone))))

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

;; TODO: -> def
(defn happy-responses []
  (read-string (slurp (io/resource "gsheets/mock_hm_responses.edn"))))

(defn +syncing [responses]
  (assoc responses
         {:method :get, :url "/api/v2/mb/connections", :body nil}
         [:ok
          {:status 200,
           :body [{:updated-at "2025-01-27T18:43:04Z",
                   :hosted-instance-resource-id 7,
                   :last-sync-at nil,
                   :error-detail nil,
                   :type "gdrive",
                   :hosted-instance-id "f390ec19-bd44-48ae-991c-66817182a376",
                   :last-sync-started-at "2025-01-27T18:43:04Z",
                   :status "syncing",
                   :id "049f3007-2146-4083-be38-f160c526aca7",
                   :created-at "2025-01-27T18:43:02Z"}]}]))

(defn mock-make-request
  ([responses config method url] (mock-make-request responses config method url nil))
  ([responses _config method url body]
   (get responses {:method method :url url :body body}
        [:error {:status 404}])))

(deftest can-get-service-account-test
  (let [[status response] (mock-make-request (happy-responses)
                                             (#'gsheets.api/->config)
                                             :get
                                             "/api/v2/mb/connections-google/service-account")]
    (is (= :ok status))
    (is (malli= [:map [:email [:string {:min 1}]]] (:body response)))))

(def ^:private
  gdrive-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "<gdrive-link>")

(defmacro with-sample-db-as-dwh [& body]
  "We need an attached dwh for these tests, so let's have the sample db fill in for us:"
  `(try
     (t2/update! :model/Database :id 1 {:is_attached_dwh true})
     ~@body
     (finally (t2/update! :model/Database :id 1 {:is_attached_dwh false}))))

(deftest post-folder-test
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh" "hosting"})]
    (with-redefs [hm.client/make-request (partial mock-make-request (happy-responses))]
      (with-sample-db-as-dwh
        (is (= {:status "loading", :folder_url gdrive-link}
               (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder" {:url gdrive-link})))))))

(deftest post-folder-syncing-test
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh" "hosting"})]
    (with-redefs [hm.client/make-request (partial mock-make-request (+syncing (happy-responses)))]
      (is (= {:status "loading", :folder_url gdrive-link}
             (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder" {:url gdrive-link}))))))

(defn- do-sync-request! []
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh" "hosting"})]
    (with-redefs [hm.client/make-request (partial mock-make-request (+syncing (happy-responses)))]
      (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder" {:url gdrive-link}))))

(deftest get-folder-test
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh" "hosting"})]
    ;; puts us into loading state
    (do-sync-request!)
    (with-redefs [hm.client/make-request (partial mock-make-request (happy-responses))]
      ;; when the dwh has never been synced
      (with-redefs [gsheets.api/get-last-dwh-sync-time (constantly nil)]
          (with-sample-db-as-dwh
          (is (partial= {:status "loading", :folder_url "<gdrive-link>" :db_id 1}
                        (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")))
          (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")))
      ;; when the local sync time is before the last gdrive connection sync time, we should be status=loading.
      (with-redefs [gsheets.api/get-last-dwh-sync-time (constantly (t/instant "2000-01-01T00:00:00Z"))]
        (with-sample-db-as-dwh
          (is (partial= {:status "loading", :folder_url "<gdrive-link>" :db_id 1}
                        (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")))
          (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")))
      ;; when the local sync time is after the last gdrive connection sync time, we should be status=complete.
      (with-redefs [gsheets.api/get-last-dwh-sync-time (constantly (t/instant "2222-01-01T00:00:00Z"))]
        (with-sample-db-as-dwh
          (is (partial= {:status "complete"
                         :folder_url "<gdrive-link>"
                         :db_id 1}
                        (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")))
          (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder"))))))

(deftest delete-folder-test
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh" "hosting"})]
    (with-redefs [hm.client/make-request (partial mock-make-request (happy-responses))]
      (with-sample-db-as-dwh
        (is (= {:status "not-connected"}
               (mt/user-http-request :crowberto :delete 200 "ee/gsheets/folder")))))))

(defn +empty-conn-listing [responses]
  (assoc responses {:method :get, :url "/api/v2/mb/connections", :body nil}
         [:ok {:status 200,
               :body []}]))

(deftest delete-folder-cannot-find
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh" "hosting"})]
    (with-redefs [hm.client/make-request (partial mock-make-request (+empty-conn-listing (happy-responses)))]
      (with-sample-db-as-dwh
        (is (= "Unable to find google drive connection."
               (:message (mt/user-http-request :crowberto :delete 200 "ee/gsheets/folder"))))))))

(defn +failed-delete-response [responses]
  (assoc responses
         {:method :delete, :url "/api/v2/mb/connections/049f3007-2146-4083-be38-f160c526aca7", :body nil}
         [:error {}]))

(deftest delete-folder-fail
  (binding [token-check/*token-features* (constantly #{"etl-connections" "attached-dwh" "hosting"})]
    (with-redefs [hm.client/make-request (partial mock-make-request (+failed-delete-response (happy-responses)))]
      (with-sample-db-as-dwh
        (is (= "Unable to disconnect google service account"
               (:message (mt/user-http-request :crowberto :delete 200 "ee/gsheets/folder"))))))))
