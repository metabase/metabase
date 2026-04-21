(ns metabase-enterprise.gsheets.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.gsheets.api :as gsheets.api]
   [metabase-enterprise.gsheets.settings :refer [gsheets]]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.test :as mt]
   [metabase.util.string :as u.string]))

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
      (is (partial= {:message "Google Sheets integration is not enabled."}
                    (mt/user-http-request :crowberto :get 402 "ee/gsheets/service-account"))))))

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
      (is (= "Google Sheets integration is not enabled."
             (:message (mt/user-http-request :crowberto :get 402 "ee/gsheets/service-account")))))))

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
  sheet-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "https://docs.google.com/spreadsheets/expected-sheet-link")

(def ^:private
  gsheet-error-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "https://docs.google.com/spreadsheets/error-gdrive-link")

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

(def ^:private
  gdrive-paused-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "eef1ae21-924e-4cba-9420-3a57aa06c955")

(def ^:private
  gdrive-400-error-link
  "A 400 response from HM. nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "93662bf7-b1c7-442b-80ec-18dee23894fa")

(def ^:private
  gdrive-403-error-link
  "A 403 response from HM. nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "e5b50d83-c1d6-4382-8351-ff95a23af60e")

(def ^:private
  gdrive-200-error-link
  "A 200 'error' response from HM. nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "e8653c8d-4d86-4ebc-92a3-0468252b9d07")

(defmacro with-sample-db-as-dwh [& body]
  "We need an attached dwh for these tests, so let's have the sample db fill in for us:"
  (let [db-sym (gensym "db-")]
    `(mt/with-temp [:model/Database ~db-sym {:is_attached_dwh true}]
       ~@body)))

(deftest create-folder-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (mt/with-temporary-setting-values [gsheets nil]
        (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
          (let [result (mt/user-http-request :crowberto :post 200 "ee/gsheets/connection" {:url gdrive-link})]
            (is (partial=
                 {:status "syncing", :url gdrive-link, :created_by_id (mt/user->id :crowberto)}
                 result))
            (is (pos-int? (:sync_started_at result))))
          (let [saved (gsheets)]
            (is (partial= {:url "https://drive.google.com/drive/expected-gdrive-link", :created-by-id (mt/user->id :crowberto)}
                          saved))
            (is (pos-int? (:created-at saved)))
            (is (u.string/valid-uuid? (:gdrive/conn-id saved)))))))))

(deftest create-sheet-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
        (is (partial=
             {:status "syncing", :url sheet-link}
             (mt/user-http-request :crowberto :post 200 "ee/gsheets/connection" {:url sheet-link})))))))

(deftest create-error-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (mt/with-temporary-setting-values [gsheets nil]
        (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
          (let [result (mt/user-http-request :crowberto :post 502 "ee/gsheets/connection" {:url gsheet-error-link})]
            (is (partial=
                 {:message     "Unable to setup drive folder sync.\nPlease check that the folder is shared with the proper service account email and sharing permissions."
                  :error_message "Status Reason"
                  :errors      true
                  :hm/response {:status 400
                                :body   {:error-detail "Error detail"
                                         :status-reason "Status Reason"}}}

                 result)))
          (let [saved (gsheets)]
            (is (= {} saved))))))))

(deftest folder-syncing-test
  (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
    (testing "Sync starts"
      (with-redefs [hm.client/make-request (partial mock-make-request (+syncing happy-responses))]
        (mt/with-temporary-setting-values [gsheets {:url "stored-url" :created-by-id 2 :gdrive/conn-id gdrive-syncing-link}]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/gsheets/connection/sync")]
            (is (partial= {:status "syncing", :url "stored-url", :created_by_id 2}
                          response))
            (is (pos-int? (:sync_started_at response)))
            (is (nil? (:sync_started_at (gsheets))))
            (is (nil? (:status (gsheets))))))))
    (testing "Error if folder not set up"
      (mt/with-temporary-setting-values [gsheets nil]
        (let [response (mt/user-http-request :crowberto :post 404 "ee/gsheets/connection/sync")]
          (is (partial= {:errors true, :message "No attached google sheet(s) found.", :error_message nil} response)))))))

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
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
                (is (= {:status "not-connected"} response))))))
        (testing "when state==initializing, status==syncing"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-initializing-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
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
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
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
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
                (is (partial= {:status "active", :url "test-url" :created_by_id 2}
                              response))
                (is (pos-int? (:db_id response)))
                (is (nil? (:sync_started_at response)))
                (is (pos-int? (:last_sync_at response)))
                (is (pos-int? (:next_sync_at response)))
                (testing "current state info doesn't get persisted"
                  (is (nil? (:sync_started_at (gsheets))))
                  (is (nil? (:last_sync_at (gsheets))))
                  (is (nil? (:last_sync_at (gsheets)))))))))
        (testing "when paused"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-paused-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
                (is (partial= {:status "error",
                               :url "test-url"
                               :created_by_id 2
                               :error_message "DWH quota exceeded"
                               :hm/response {:status 200
                                             :body {:status "paused"
                                                    :status-reason "DWH quota exceeded"}}}
                              response))
                (is (pos-int? (:db_id response)))
                (is (nil? (:sync_started_at response)))
                (is (pos-int? (:last_sync_at response)))
                (testing "current state info doesn't get persisted"
                  (is (nil? (:sync_started_at (gsheets))))
                  (is (nil? (:last_sync_at (gsheets))))
                  (is (nil? (:last_sync_at (gsheets)))))))))
        (testing "when paused and no last sync"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id "never-synced")]
            (with-redefs [hm.client/make-request (partial mock-make-request
                                                          (assoc happy-responses
                                                                 {:method :get, :url "/api/v2/mb/connections/never-synced", :body nil}
                                                                 [:ok
                                                                  {:status 200,
                                                                   :body   {:last-sync-started-at        nil
                                                                            :hosted-instance-resource-id 15378,
                                                                            :last-sync-at                nil
                                                                            :type                        "gdrive"
                                                                            :status-reason               "DWH quota exceeded."
                                                                            :updated-at                  "2025-05-29T14:36:26Z"
                                                                            :hosted-instance-id          "c6633c12-8ed2-4e74-ba7f-3602791d252c"
                                                                            :status                      "paused"
                                                                            :id                          "7346e101-fa51-4f1a-9655-810aaea63fe4"
                                                                            :error                       nil
                                                                            :sync-callback-token         nil
                                                                            :created-at                  "2025-05-29T14:36:25Z"
                                                                            :error-detail                nil}}]))]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
                (is (partial= {:status "error", :url "test-url" :created_by_id 2 :error_message "DWH quota exceeded."}
                              response))
                (is (pos-int? (:db_id response)))
                (is (nil? (:sync_started_at response)))
                (is (nil? (:last_sync_at response)))
                (testing "current state info doesn't get persisted"
                  (is (nil? (:sync_started_at (gsheets))))
                  (is (nil? (:last_sync_at (gsheets))))
                  (is (nil? (:last_sync_at (gsheets)))))))))
        (testing "when 400 error response"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-400-error-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
                (is (partial= {:status "error"
                               :url "test-url"
                               :created_by_id 2
                               :error_message "Unable to check Google Drive connection. Reconnect if the issue persists."
                               :hm/response {:status 400
                                             :body {:error-detail "Error Detail"
                                                    :type "gdrive"}}}

                              response))
                (is (pos-int? (:db_id response)))))))
        (testing "when 200 error response"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-200-error-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
                (is (partial= {:status "error", :url "test-url" :created_by_id 2} response))
                (is (pos-int? (:db_id response)))))))))))

(deftest get-folder-test-invalid-connections
  (with-sample-db-as-dwh
    (let [mock-gsheet {:created-by-id 2
                       :url           "test-url",
                       :created-at    15
                       :db-id         1}]
      (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
        (testing "when the connection does not exist, it is deleted"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-403-error-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
                (is (= {:status "not-connected"} response))
                (is (= {} (gsheets)))))))
        (testing "when the HM gives a 403 response for the connection, but it shows in the connection list then it is not deleted"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-active-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request (assoc happy-responses
                                                                                   {:method :get, :url (str "/api/v2/mb/connections/" gdrive-active-link), :body nil}
                                                                                   [:error
                                                                                    {:status 403,
                                                                                     :body   {:error "User not authorized to act over resource."}}]))]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
                (is (partial= {:status "error"
                               :error_message "Unable to check Google Drive connection. Reconnect if the issue persists."
                               :hm/response {:status 403
                                             :body {:error "User not authorized to act over resource."}}} response))
                (is (= 15 (:created-at (gsheets))))))))
        (testing "when the HM gives a 403 response for the connection, and the connection list fails, then it is not deleted"
          (mt/with-temporary-setting-values [gsheets (assoc mock-gsheet :gdrive/conn-id gdrive-403-error-link)]
            (with-redefs [hm.client/make-request (partial mock-make-request
                                                          (assoc happy-responses
                                                                 {:method :get, :url "/api/v2/mb/connections", :body nil}
                                                                 [:error
                                                                  {:status 403,
                                                                   :body   {:error "User not authorized to act over resource."}}]))]
              (let [response (mt/user-http-request :crowberto :get 200 "ee/gsheets/connection")]
                (is (= "error" (:status response)))
                (is (= 15 (:created-at (gsheets))))))))))))

(deftest delete-folder-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (mt/with-temporary-setting-values [gsheets {:url "stored-url" :created-by-id 2}]
        (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
          (is (= {:status "not-connected"}
                 (mt/user-http-request :crowberto :delete 200 "ee/gsheets/connection")))
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
               (mt/user-http-request :crowberto :delete 200 "ee/gsheets/connection")))))))

(defn +failed-delete-response [responses]
  (assoc responses
         {:method :delete, :url "/api/v2/mb/connections/049f3007-2146-4083-be38-f160c526aca7", :body nil}
         [:error {}]))

(deftest delete-folder-fail
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (with-redefs [hm.client/make-request (partial mock-make-request (+failed-delete-response happy-responses))]
        (= {:status "not-connected"}
           (mt/user-http-request :crowberto :delete 200 "ee/gsheets/connection"))))))

(deftest url-type
  (is (= "gdrive" (#'gsheets.api/url-type "https://drive.google.com/drive/abc")))
  (is (= "gdrive" (#'gsheets.api/url-type "http://drive.google.com/drive/abc")))
  (is (= "google_spreadsheet" (#'gsheets.api/url-type "https://docs.google.com/spreadsheets/abc")))
  (is (= "google_spreadsheet" (#'gsheets.api/url-type "http://docs.google.com/spreadsheets/abc")))
  (is (thrown-with-msg? Exception #"Invalid URL: https://not.google.com/file" (#'gsheets.api/url-type "https://not.google.com/file"))))

(deftest loggable-response
  (is (= {:status 404, :body {:foo "bar"}}
         (#'gsheets.api/loggable-response {:status 404, :body {:foo "bar"}})))
  (is (= {:status 404, :body {:foo "bar2"}}
         (#'gsheets.api/loggable-response [{:status 405, :body {:foo "bar1"}}
                                           {:status 404, :body {:foo "bar2"}}])))
  (is (= {:status 500, :body "foo"}
         (#'gsheets.api/loggable-response {:status 500, :body "foo"})))
  (is (= {:status 200, :body nil}
         (#'gsheets.api/loggable-response {:status 200, :body nil}))))
