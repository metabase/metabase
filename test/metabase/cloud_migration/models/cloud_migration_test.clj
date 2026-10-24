(ns metabase.cloud-migration.models.cloud-migration-test
  (:require
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [metabase.cloud-migration.models.cloud-migration :as cloud-migration]
   [metabase.cloud-migration.settings :as cloud-migration.settings]
   [metabase.config.core :as config]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(use-fixtures :each (fn [thunk]
                      (mt/discard-setting-changes [read-only-mode]
                        (thunk))))

(defmacro mock-external-calls!
  "Mock external calls around migration creation."
  [& body]
  `(with-redefs [cloud-migration/get-store-migration (constantly {:external_id 1 :upload_url "https://up.loady"})
                 cloud-migration/migrate! identity]
     ~@body))

(defn- fake-upload-route-handler
  [migration]
  {(:upload_url migration)
   (fn [{:keys [body request-method]}]
     ;; slurp it to progress the upload
     (slurp body)
     (is (= :put
            request-method))
     {:status 200})
   (cloud-migration/migration-url (:external_id migration) "/uploaded")
   (constantly {:status 201})})

(deftest cluster?-test
  (is (boolean? (cloud-migration/cluster?))))

(deftest abs-progress-test
  (is (= 51 (cloud-migration/abs-progress 0 51 99)))
  (is (= 75 (cloud-migration/abs-progress 50 51 99)))
  (is (= 99 (cloud-migration/abs-progress 100 51 99))))

(deftest migrate!-test
  (let [migration         (mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration"))
        progress-calls    (atom {:setup  []
                                 :dump   []
                                 :upload []
                                 :done   []})
        orig-set-progress (mt/original-fn #'cloud-migration/set-progress)]
    ;; The redefs below are read on the test thread before the scheduler stops/starts;
    ;; if a future change dispatches `cluster?` or `set-progress` through a quartz worker
    ;; (which doesn't inherit `*local-redefs*`), revert that site to `with-redefs` per
    ;; the docstring of `with-dynamic-fn-redefs`.
    (mt/with-dynamic-fn-redefs [cloud-migration/cluster?     (constantly false)
                                cloud-migration/set-progress (fn [id state n]
                                                               (swap! progress-calls update state conj n)
                                                               (orig-set-progress id state n))]
      (http-fake/with-fake-routes-in-isolation (fake-upload-route-handler migration)
        (testing "works"
          (try
            (#'cloud-migration/migrate! migration)
            (finally
              (task/stop-scheduler!)))
          (is (-> @progress-calls :upload count (> 3))
              "several progress calls during upload")
          (is (->> @progress-calls :upload (every? #(and (<= 50 %) (< % 100))))
              "progress calls are between 50 (inclusive) and 100 (exclusive)")
          (is (= {:setup [1] :dump [20] :done [100]}
                 (dissoc @progress-calls :upload))
              "one progress call during other stages"))))))

(deftest migrate!-test-managed-scheduler
  (let [migration         (mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration"))]
    (mt/with-dynamic-fn-redefs [cloud-migration/cluster?     (constantly false)]
      (http-fake/with-fake-routes-in-isolation (fake-upload-route-handler migration)
        (testing "works when quartz scheduler is running"
          (task/start-scheduler!)
          (try
            (let [ex (try
                       (#'cloud-migration/migrate! migration)
                       nil
                       (catch Throwable e
                         e))]
              (is (nil? ex)))
            (finally
              (task/stop-scheduler!))))))))

(deftest migrate!-test-2
  (testing "exits early on terminal state"
    (let [migration (mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration"))]
      (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")
      (try
        (#'cloud-migration/migrate! migration)
        (finally
          (task/stop-scheduler!)))
      (is (< (:progress (t2/select-one :model/CloudMigration :id (:id migration))) 100))
      (is (not (cloud-migration.settings/read-only-mode))))))

(deftest read-only-login-test
  (let [identity-id (t2/select-one-pk :model/AuthIdentity :user_id (mt/user->id :rasta) :provider "password")
        before      (t2/select-one-fn :last_used_at :model/AuthIdentity identity-id)]
    (mt/with-temporary-setting-values [read-only-mode true]
      (mt/client :post 200 "session" (mt/user->credentials :rasta))
      (is (not= before (t2/select-one-fn :last_used_at :model/AuthIdentity identity-id))))))

(deftest read-only-model-writes-test
  (mt/with-temp [:model/Collection {id :id} {:name "original"}
                 :model/Collection {archived-id :id} {:archived true}]
    (let [collection-count (t2/count :model/Collection)]
      (mt/with-temporary-setting-values [read-only-mode true]
        (doseq [write! [#(mt/user-http-request :crowberto :put 403 (str "collection/" id) {:name "changed"})
                        #(mt/user-http-request :crowberto :post 403 "collection" {:name "new"})
                        #(mt/user-http-request :crowberto :delete 403 (str "collection/" archived-id))]]
          (is (re-find #"read-only" (write!))))
        (is (= "original" (t2/select-one-fn :name :model/Collection id)))
        (is (t2/exists? :model/Collection archived-id))
        (is (= collection-count (t2/count :model/Collection)))))))

(deftest read-only-user-creation-rolls-back-test
  (let [email (str (random-uuid) "@example.com")
        collection-count (t2/count :model/Collection)]
    (mt/with-temporary-setting-values [read-only-mode true]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read-only"
                            (t2/insert! :model/User {:email email :first_name "New" :last_name "User"})))
      (is (not (t2/exists? :model/User :email email)))
      (is (= collection-count (t2/count :model/Collection))))))

(deftest read-only-column-exceptions-test
  (testing "Every changed column must be allowed"
    (is (#'cloud-migration/update-exempted? :report_card {:changes {:last_used_at nil}}))
    (is (not (#'cloud-migration/update-exempted?
              :report_card {:changes {:id 1 :last_used_at nil :updated_at nil :name "changed"}}))))
  (testing "Column exceptions require a nonempty update"
    (doseq [args [{} {:changes {}} {:rows [{:id 1}]}]]
      (is (not (#'cloud-migration/update-exempted? :report_card args)))))
  (testing "A full exception permits inserts and deletes"
    (is (#'cloud-migration/update-exempted? :login_history {}))))

(deftest ^:synchronized store-url-test
  (testing "When not dev"
    (testing "get production store"
      (with-redefs [config/is-dev? false]
        (is (= "https://store.metabase.com" (#'cloud-migration.settings/store-url-default)))))
    (testing "Can force it with :mb-store-use-staging"
      (with-redefs [config/is-dev? false
                    config/config-bool (fn [k] (when (= k :mb-store-use-staging) true))]
        (is (= "https://store.staging.metabase.com" (#'cloud-migration.settings/store-url-default))))))
  (testing "When dev"
    (with-redefs [config/is-dev? true]
      (testing "uses staging url"
        (is (= "https://store.staging.metabase.com" (#'cloud-migration.settings/store-url-default))))
      (testing "But can force to prod"
        (mt/with-dynamic-fn-redefs [config/config-bool (fn [k] (when (= k :mb-store-use-staging) false))]
          (is (= "https://store.metabase.com" (#'cloud-migration.settings/store-url-default)))))))
  (testing "with custom url is set"
    (mt/with-dynamic-fn-redefs [config/config-str (fn [k] (when (= k :mb-store-url) "https://custom.store.com"))]
      (testing "in dev is honored"
        (with-redefs [config/is-dev? true]
          (is (= "https://custom.store.com" (#'cloud-migration.settings/store-url-default)))))
      (testing "not in dev is not honored"
        (with-redefs [config/is-dev? false]
          (is (= "https://store.metabase.com" (#'cloud-migration.settings/store-url-default))))))))
