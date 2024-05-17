(ns metabase.api.cloud-migration-test
  "Tests for /api/cloud-migration. "
  (:require
   [clojure.test :refer :all]
   [metabase.models.cloud-migration :as cloud-migration]
   [metabase.models.cloud-migration-test :as cloud-migration-test]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [thunk]
                      (mt/discard-setting-changes [read-only-mode]
                        (thunk))))

(set! *warn-on-reflection* true)

(deftest permissions-test
  (testing "Requires superuser"
    (mt/user-http-request :rasta :post 403 "cloud-migration")
    (mt/user-http-request :rasta :get 403 "cloud-migration")
    (mt/user-http-request :rasta :put 403 "cloud-migration/cancel")

    (cloud-migration-test/mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration"))
    (mt/user-http-request :crowberto :get 200 "cloud-migration")
    (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")))

(deftest hosted-test
  (with-redefs [premium-features/is-hosted? (constantly true)]
    (mt/user-http-request :crowberto :post 400 "cloud-migration")))

(deftest lifecycle-test
  (let [latest-migration (cloud-migration-test/mock-external-calls!
                          (mt/user-http-request :crowberto :post 200 "cloud-migration"))]
    (is (= latest-migration (mt/user-http-request :crowberto :get 200 "cloud-migration")))
    (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")
    (is (= "cancelled" (:state (mt/user-http-request :crowberto :get 200 "cloud-migration"))))))

(deftest concurrency-test
  ;; The Gods of Concurrency with terror and slaughter return
  (run! (partial t2/insert-returning-instance! :model/CloudMigration)
        [{:external_id 1 :upload_url "" :state :dump}
         {:external_id 2 :upload_url "" :state :cancelled}
         {:external_id 3 :upload_url "" :state :error}
         {:external_id 5 :upload_url "" :state :done}
         {:external_id 4 :upload_url "" :state :setup}])
  (try
    (cloud-migration/read-only-mode! true)

    (is (= "setup" (:state (mt/user-http-request :crowberto :get 200 "cloud-migration"))))
    (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")
    (mt/user-http-request :crowberto :get 200 "cloud-migration")
    (finally
      (is (not (cloud-migration/read-only-mode))))))
