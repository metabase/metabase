(ns metabase-enterprise.api.gsheets-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase-enterprise.gsheets.api :as gsheets.api]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import [java.time
            LocalDate
            LocalTime
            ZoneId
            ZonedDateTime]))

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

(defn- ->zdt
  [^long date ^long time ^String zone]
  (ZonedDateTime/of (LocalDate/of date 1 1) (-> LocalTime/MIDNIGHT (.plusSeconds time)) (ZoneId/of zone)))

(deftest sync-complete?-test
  (let [earlier-time (->zdt 2000 0 "UTC")
        later-time (->zdt 2022 0 "UTC")]

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

(deftest can-get-service-account-test
  (let [[status response] (mock-make-request happy-responses
                                             :get
                                             "/api/v2/mb/connections-google/service-account")]
    (is (= :ok status))
    (is (malli= [:map [:email [:string {:min 1}]]] (:body response)))))

(def ^:private
  gdrive-link
  "nb: if you change this, change it in test_resources/gsheets/mock_hm_responses.edn"
  "<expected-gdrive-link>")

(defmacro with-sample-db-as-dwh [& body]
  "We need an attached dwh for these tests, so let's have the sample db fill in for us:"
  `(try
     (t2/update! :model/Database :id 1 {:is_attached_dwh true})
     ~@body
     (finally (t2/update! :model/Database :id 1 {:is_attached_dwh false}))))

(deftest post-folder-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
        (is (partial=
             {:status "loading", :folder_url gdrive-link}
             (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder" {:url gdrive-link})))))))

(deftest post-folder-syncing-test
  (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
    (with-redefs [hm.client/make-request (partial mock-make-request (+syncing happy-responses))]
      (is (partial= {:status "loading", :folder_url gdrive-link}
                    (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder" {:url gdrive-link}))))))

(deftest get-folder-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      ;; This puts us into loading state:
      (with-redefs [hm.client/make-request (partial mock-make-request (+syncing happy-responses))]
        (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder" {:url gdrive-link}))
      (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
        (dotimes [_ 10]
          (with-redefs [gsheets.api/get-last-mb-dwh-sync-time (constantly nil)]
            (testing (str "when the dwh has never been synced, we should be status=loading.\n"
                          "calling it over and over will return the same result.")
              (is (partial= {:status "loading", :folder_url gdrive-link :db_id 1}
                            (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder"))))
            (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")))
        (testing "when the local sync time is before the last gdrive connection sync time, we should be status=loading."
          (with-redefs [gsheets.api/get-last-mb-dwh-sync-time (constantly (t/instant "2000-01-01T00:00:00Z"))]
            (is (partial= {:status "loading", :folder_url gdrive-link :db_id 1}
                          (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")))
            (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")))
        (testing "when the local sync time is after the last gdrive connection sync time, then we should be status=complete."
          (with-redefs [gsheets.api/get-last-mb-dwh-sync-time (constantly (t/instant "2222-01-01T00:00:00Z"))]
            (is (partial= {:status "complete" :folder_url gdrive-link :db_id 1}
                          (mt/user-http-request :crowberto :get 200 "ee/gsheets/folder")))))))))

(deftest get-folder-timeout-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (with-redefs [hm.client/make-request (partial mock-make-request (+syncing happy-responses))]
        (let [resp (mt/user-http-request :crowberto :post 200 "ee/gsheets/folder" {:url gdrive-link})]
          (with-redefs [gsheets.api/get-last-mb-dwh-sync-time (constantly nil)
                        gsheets.api/seconds-from-epoch-now (constantly
                                                            ;; set "now" to 1 second after now + folder upload time:
                                                            (+ 1 @#'gsheets.api/*folder-setup-timeout-seconds*
                                                               (:folder-upload-time resp)))]
            (is (= {:errors true, :message "Timeout syncing google drive folder, please try again."}
                   (mt/user-http-request :crowberto :get 408 "ee/gsheets/folder"))
                "When we timeout, we should return an error.")))))))

(deftest delete-folder-test
  (with-sample-db-as-dwh
    (mt/with-premium-features #{:etl-connections :attached-dwh :hosting}
      (with-redefs [hm.client/make-request (partial mock-make-request happy-responses)]
        (is (= {:status "not-connected"}
               (mt/user-http-request :crowberto :delete 200 "ee/gsheets/folder")))))))

(defn +empty-conn-listing [responses]
  (assoc responses {:method :get, :url "/api/v2/mb/connections", :body nil}
         [:ok {:status 200,
               :body []}]))

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
