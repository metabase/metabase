(ns metabase.api.cloud-migration-test
  "Tests for /api/cloud-migration. "
  (:require
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [metabase.api.cloud-migration :as cloud-migration]
   [metabase.models.cloud-migration :refer [CloudMigration]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      (mt/discard-setting-changes [read-only-mode]
                        (thunk))))

(defmacro mock-external-calls!
  "Mock external calls around migration creation."
  [& body]
  `(with-redefs [cloud-migration/get-store-migration (constantly {:external_id 1 :upload_url "https://up.loady"})
                 cloud-migration/migrate! identity]
     ~@body))

(deftest permissions-test
  (testing "Requires superuser"
    (mt/user-http-request :rasta :post 403 "cloud-migration")
    (mt/user-http-request :rasta :get 403 "cloud-migration")
    (mt/user-http-request :rasta :put 403 "cloud-migration/cancel")

    (mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration"))
    (mt/user-http-request :crowberto :get 200 "cloud-migration")
    (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")))

(deftest lifecycle-test
  (let [latest-migration (mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration"))]
    (is (= latest-migration (mt/user-http-request :crowberto :get 200 "cloud-migration")))
    (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")
    (is (= "cancelled" (:state (mt/user-http-request :crowberto :get 200 "cloud-migration"))))))

(deftest concurrency-test
  ;; The Gods of Concurrency with terror and slaughter return
  (run! (partial t2/insert-returning-instance! CloudMigration)
        [{:external_id 1 :upload_url "" :state :dump}
         {:external_id 2 :upload_url "" :state :cancelled}
         {:external_id 3 :upload_url "" :state :error}
         {:external_id 5 :upload_url "" :state :done}
         {:external_id 4 :upload_url "" :state :setup}])
  (cloud-migration/read-only-mode! true)

  (is (= "setup" (:state (mt/user-http-request :crowberto :get 200 "cloud-migration"))))
  (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")
  (mt/user-http-request :crowberto :get 200 "cloud-migration")
  (is (not (cloud-migration/read-only-mode))))

(deftest migrate!-test
  (testing "works"
    (let [migration         (mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration"))
          progress-calls    (atom {:setup  []
                                   :dump   []
                                   :upload []
                                   :done   []})
          orig-set-progress @#'cloud-migration/set-progress]
      (with-redefs [cloud-migration/cluster?     (constantly false)
                    cloud-migration/set-progress (fn [id state n]
                                                   (swap! progress-calls update state conj n)
                                                   (orig-set-progress id state n))]
        (http-fake/with-fake-routes-in-isolation
            {(:upload_url migration)
             (fn [{:keys [body request-method]}]
               ;; slurp it to progress the upload
               (slurp body)
               (is (= request-method :put))
               {:status 200})
             (str (cloud-migration/metabase-store-migration-url) "/" (:id migration) "/uploaded")
             (constantly {:status 201})}
          (#'cloud-migration/migrate! migration)
          (is (-> @progress-calls :upload count (> 3))
              "several progress calls during upload")
          (is (= {:setup [1] :dump [20] :done [100]}
                 (dissoc @progress-calls :upload))
              "one progress call during other stages")))))

  (testing "exits early on terminal state"
    (let [migration (mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration"))]
      (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")
      (#'cloud-migration/migrate! migration)
      (is (= (:progress (t2/select-one CloudMigration :id (:id migration))) 0))
      (is (not (cloud-migration/read-only-mode))))))
