(ns metabase.models.cloud-migration-test
  (:require
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [metabase.models.cloud-migration :as cloud-migration]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [thunk]
                      (mt/discard-setting-changes [read-only-mode]
                        (thunk))))

(defmacro mock-external-calls!
  "Mock external calls around migration creation."
  [& body]
  `(with-redefs [cloud-migration/get-store-migration (constantly {:external_id 1 :upload_url "https://up.loady"})
                 cloud-migration/migrate! identity]
     ~@body))

(deftest cluster?-test
  (is (boolean? (cloud-migration/cluster?))))

(deftest abs-progress-test
  (is (= 51 (cloud-migration/abs-progress 0 51 99)))
  (is (= 75 (cloud-migration/abs-progress 50 51 99)))
  (is (= 99 (cloud-migration/abs-progress 100 51 99))))

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
             (str (cloud-migration/migration-url (:external_id migration) "/uploaded"))
             (constantly {:status 201})}
          (#'cloud-migration/migrate! migration)
          (is (-> @progress-calls :upload count (> 3))
              "several progress calls during upload")
          (is (->> @progress-calls :upload (every? #(and (<= 50 %) (< % 100))))
              "progress calls are between 50 (inclusive) and 100 (exclusive)")
          (is (= {:setup [1] :dump [20] :done [100]}
                 (dissoc @progress-calls :upload))
              "one progress call during other stages")))))

  (testing "exits early on terminal state"
    (let [migration (mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration"))]
      (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")
      (#'cloud-migration/migrate! migration)
      (is (< (:progress (t2/select-one :model/CloudMigration :id (:id migration))) 100))
      (is (not (cloud-migration/read-only-mode))))))

(deftest read-only-login-test
  (cloud-migration/read-only-mode! true)
  (mt/client :post 200 "session" (mt/user->credentials :rasta)))
