(ns metabase-enterprise.api.gsheets-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.gsheets.api :as gsheets.api]
   [metabase-enterprise.gsheets.settings :refer [gsheets]]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.test :as mt]
   [metabase.util.string :as u.string]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest gsheets-calls-fail-when-missing-etl-connections
  (mt/with-temporary-setting-values [api-key "some"]
    (mt/with-premium-features #{:attached-dwh}
      (is (= (str "ETL Connections is a paid feature not currently available to your instance. "
                  "Please upgrade to use it. Learn more at metabase.com/upgrade/")
             (:message (mt/user-http-request :crowberto :get 402 "ee/gsheets/service-account")))))))

(deftest gsheets-calls-fail-when-not-activated
  (mt/with-premium-features #{:etl-connections :attached-dwh}
    (mt/with-temporary-setting-values [api-key nil]
      (is (partial= {:message "Missing api-key."}
                    (mt/user-http-request :crowberto :get 500 "ee/gsheets/service-account"))))))

(deftest gsheets-calls-fail-when-missing-attached-dwh
  (mt/with-temporary-setting-values [api-key "some"]
    (mt/with-premium-features #{:etl-connections}
      (is (= (str "Attached DWH is a paid feature not currently available to your instance. "
                  "Please upgrade to use it. Learn more at metabase.com/upgrade/")
             (:message (mt/user-http-request :crowberto :get 402 "ee/gsheets/service-account")))))))

(deftest gsheets-calls-fail-when-non-superuser
  (mt/with-premium-features #{:etl-connections :attached-dwh}
    (mt/with-temporary-setting-values [api-key nil]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/gsheets/service-account"))))))

(deftest gsheets-calls-fail-when-there-is-no-mb-api-key
  (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
    (mt/with-temporary-setting-values [api-key nil]
      (is (= "Missing api-key."
             (:message (mt/user-http-request :crowberto :get 500 "ee/gsheets/service-account")))))))

(def happy-responses (read-string (slurp (io/resource "gsheets/mock_hm_responses.edn"))))

(defn +syncing [responses]
  (assoc responses
         {:method :get, :url "/api/v2/mb/connections", :body nil}
         [:ok
          {:status 200,
           :body   [{:updated-at                  "2025-01-27T18:43:04Z",
                     :hosted-instance-resource-id 7,
                     :last-sync-at                nil,
                     :error-detail                nil,
                     :type                        "gdrive",
                     :hosted-instance-id          "f390ec19-bd44-48ae-991c-66817182a376",
                     :last-sync-started-at        "2025-01-27T18:43:04Z",
                     :status                      "syncing",
                     :id                          "049f3007-2146-4083-be38-f160c526aca7",
                     :created-at                  "2025-01-27T18:43:02Z"}]}]))

(defn mock-make-request
  ([responses method url] (mock-make-request responses method url nil))
  ([responses method url body]
   (get responses {:method method :url url :body body}
        [:error {:status 404}])))

(deftest gsheets-calls-pass-when-activated-and-superuser
  (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
    (mt/with-temporary-setting-values [api-key "non-blank"]
      (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
        (is (malli=
             [:map [:email [:maybe :string]]]
             (mt/user-http-request :crowberto :get 200 "ee/gsheets/service-account")))))))

(deftest can-get-service-account-test
  (let [[status response] (mock-make-request happy-responses
                                             :get
                                             "/api/v2/mb/connections-google/service-account")]
    (is (= :ok status))
    (is (malli= [:map [:email [:string {:min 1}]]] (:body response)))))

(def ^:private
  gdrive-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "https://drive.google.com/drive/expected-gdrive-link")

(def ^:private
  gsheet-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "https://docs.google.com/spreadsheets/expected-sheet-link")

(def ^:private
  gdrive-active-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "049f3007-2146-4083-be38-f160c526aca7")

(def ^:private
  gdrive-syncing-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "663f3e8a-bfff-4b3f-ad5f-20ceadf929cc")

(def ^:private
  gdrive-initializing-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "80b0635a-f0d9-4103-9ac8-389df7fd250a")

(defmacro with-sample-db-as-dwh [& body]
  "We need an attached dwh for these tests, so let's have the sample db fill in for us:"
  `(try
     (t2/update! :model/Database :id 1 {:is_attached_dwh true})
     ~@body
     (finally (t2/update! :model/Database :id 1 {:is_attached_dwh false}))))

(deftest post-folder-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (mt/with-temporary-setting-values [gsheets nil]
        (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
          (let [result (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder" {:url gdrive-link})]
            (is (partial=
                 {:status "syncing", :url gdrive-link, :created_by_id (mt/user->id :crowberto)}
                 result))
            (is (pos-int? (:sync_started_at result))))
          (let [saved (gsheets)]
            (is (partial= {:url "https://drive.google.com/drive/expected-gdrive-link", :created-by-id (mt/user->id :crowberto)}
                          saved))
            (is (pos-int? (:created-at saved)))
            (is (u.string/valid-uuid? (:gdrive/conn-id saved)))))))))

(deftest post-sheet-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
        (is (partial=
             {:status "syncing", :url gsheet-link}
             (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder" {:url gsheet-link})))))))

(deftest folder-syncing-test
  (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
    (testing "Sync starts"
      (with-redefs [hm.client/make-request (partial mock-make-request (+syncing happy-responses))]
        (mt/with-temporary-setting-values [gsheets {:url "stored-url" :created-by-id 2}]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder/sync")]
            (is (partial= {:status "syncing", :url "stored-url", :created_by_id 2}
                          response))
            (is (pos-int? (:sync_started_at response)))
            (is (nil? (:sync_started_at (gsheets))))
            (is (nil? (:status (gsheets))))))))
    (testing "Error if folder not set up"
      (mt/with-temporary-setting-values [gsheets nil]
        (let [response (mt/user-http-request :crowberto :post 404 "ee/gsheets/folder/sync")]
          (is (partial= {:errors true, :message "No attached google sheet(s) found."} response)))))))

(deftest get-folder-test
  (with-sample-db-as-dwh
    (let [mock-gsheet {:created-by-id 2
                       :url           "test-url",
                       :created-at    15
                       :db-id         1}]
      (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
        (testing "when no config exists, return not-connected"
          (mt/with-temporary-setting-values [gsheets nil]
            (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")]
                (is (= {:status "not-connected"} response))))))
        (testing "when state==initializing, status==syncing"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-initializing-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")]
                (is (partial= {:status "syncing", :url "test-url" :created_by_id 2}
                              response))
                (is (pos-int? (:sync_started_at response)))
                (is (pos-int? (:db_id response)))
                (is (nil? (:last_sync_at response)))
                (is (nil? (:next_sync_at response)))
                (testing "current state info doesn't get persisted"
                  (is (nil? (:sync_started_at (gsheets)))))))))
        (testing "when state==syncing, status==syncing"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-syncing-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")]
                (is (partial= {:status "syncing", :url "test-url" :created_by_id 2}
                              response))
                (is (pos-int? (:sync_started_at response)))
                (is (pos-int? (:db_id response)))
                (is (pos-int? (:last_sync_at response)))
                (is (nil? (:next_sync_at response)))
                (testing "current state info doesn't get persisted"
                  (is (nil? (:sync_started_at (gsheets)))))))))
        (testing "when state==active, status==active"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-active-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")]
                (is (partial= {:status "active", :url "test-url" :created_by_id 2}
                              response))
                (is (pos-int? (:db_id response)))
                (is (nil? (:sync_started_at response)))
                (is (pos-int? (:last_sync_at response)))
                (is (pos-int? (:next_sync_at response)))
                (testing "current state info doesn't get persisted"
                  (is (nil? (:sync_started_at (gsheets))))
                  (is (nil? (:last_sync_at (gsheets))))
                  (is (nil? (:last_sync_at (gsheets)))))))))))))

(deftest delete-folder-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (mt/with-temporary-setting-values [gsheets {:url "stored-url" :created-by-id 2}]
        (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
          (is (= {:status "not-connected"}
                 (mt/user-http-request :crowberto :delete 200 "ee/gsheets/folder")))
          (is (empty? (gsheets))))))))

(defn +empty-conn-listing [responses]
  (assoc responses {:method :get, :url "/api/v2/mb/connections", :body nil}
         [:ok {:status 200,
               :body   []}]))

(deftest delete-folder-cannot-find
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (with-redefs [hm.client/make-request (partial mock-make-request (+empty-conn-listing happy-responses))]
        (is (= {:status "not-connected"}
               (mt/user-http-request :crowberto :delete 200 "ee/gsheets/folder")))))))

(defn +failed-delete-response [responses]
  (assoc responses
         {:method :delete, :url "/api/v2/mb/connections/049f3007-2146-4083-be38-f160c526aca7", :body nil}
         [:error {}]))

(deftest delete-folder-fail
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (with-redefs [hm.client/make-request (partial mock-make-request (+failed-delete-response happy-responses))]
        (= {:status "not-connected"}
           (mt/user-http-request :crowberto :delete 200 "ee/gsheets/folder"))))))

(deftest url-type
  (is (= "gdrive" (#'gsheets.api/url-type "https://drive.google.com/drive/abc")))
  (is (= "gdrive" (#'gsheets.api/url-type "http://drive.google.com/drive/abc")))
  (is (= "google_spreadsheet" (#'gsheets.api/url-type "https://docs.google.com/spreadsheets/abc")))
  (is (= "google_spreadsheet" (#'gsheets.api/url-type "http://docs.google.com/spreadsheets/abc")))
  (is (thrown-with-msg? Exception #"Invalid URL: https://not.google.com/file" (#'gsheets.api/url-type "https://not.google.com/file"))))

(deftest sync-folder-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (mt/with-temporary-setting-values [gsheets {:status     "loading",
                                                  :url        gdrive-link,
                                                  :created_at 1741624582,
                                                  :conn_id    "<connection-id>"}]
        (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder/sync")]
            (is (partial= {:status "syncing"} response))
            (is (pos-int? (:sync_started_at response)))
            (is (nil? (:last_sync_at response)))))))))
