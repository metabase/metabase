(ns metabase.models.cloud-migration-test
  (:require
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [metabase.models.cloud-migration :as cloud-migration :refer [CloudMigration]]
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
