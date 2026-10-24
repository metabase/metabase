(ns metabase.cloud-migration.models.cloud-migration-test
  (:require
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [metabase.cloud-migration.models.cloud-migration :as cloud-migration]
   [metabase.cloud-migration.settings :as cloud-migration.settings]
   [metabase.config.core :as config]
   [metabase.query-processor.db :as qp.db]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

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

(defn- compile-query [query]
  (t2.pipeline/compile :toucan.result-type/* nil query))

(deftest read-only-honeysql-writes-test
  (mt/with-temporary-setting-values [read-only-mode true]
    (doseq [query [{:update :collection :set {:name "changed"}}
                   {:update :report_card :set {:name "changed" :id 1 :last_used_at nil :updated_at nil}}
                   {:update :report_card :set {}}
                   {:insert-into [:report_card] :values [{:name "new"}]}
                   {:delete-from :report_card}
                   {:replace-into :report_card :values [{:id 1}]}
                   {:insert-into [:report_card [:id]] :values [[1]]
                    :on-conflict [:id] :do-update-set {:last_used_at nil}}
                   {:insert-into [:report_card] :values [{:id 1}]
                    :on-duplicate-key-update {:last_used_at nil}}
                   {:truncate :report_card}
                   {:drop-table [:if-exists :collection]}
                   {:alter-table :collection :add-column [:test :int]}
                   {:delete [:c] :from [[:collection :c]]}
                   {:delete :c :from [[:collection :c]]}
                   {:update :core_user :join [[:collection :c] [:= :c.personal_owner_id :core_user.id]]
                    :set {:c.name "changed"}}
                   {:with [[:deleted ^:allow-subquery {:delete-from :collection :returning [:id]}]]
                    :select [:*] :from [:deleted]}
                   {:with-recursive [[:deleted ^:allow-subquery {:delete-from :collection :returning [:id]}]]
                    :select [:*] :from [:deleted]}]]
      (testing (pr-str query)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read-only"
                              (compile-query query)))))))

(deftest read-only-qualified-targets-test
  (mt/with-temporary-setting-values [read-only-mode true]
    (doseq [target [:collection [:collection :c] :public.collection :public/collection
                    "COLLECTION" [(h2x/identifier :table "PUBLIC" "COLLECTION")]]]
      (testing (pr-str target)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read-only"
                              (compile-query {:update target :set {:name "changed"}})))))
    (doseq [target [:report_card [:report_card :c] :public.report_card
                    [(h2x/identifier :table "PUBLIC" "REPORT_CARD")]]
            column [:last_used_at :c.last_used_at :c/last_used_at]]
      (is (seq (compile-query {:update target :set {column nil}}))))))

(deftest read-only-exceptions-test
  (mt/with-temporary-setting-values [read-only-mode true]
    (doseq [query [{:update :report_card :set {:last_used_at nil}}
                   {:update :auth_identity :set {:last_used_at nil}}
                   {:insert-into :core_session :values [{:id "session"}]}
                   {:insert-into :login_history :values [{:user_id 1}]}
                   {:delete-from :login_history}
                   {:update :core_user :set {:last_login nil}}
                   {:select [:*] :from [:collection]}]]
      (is (seq (compile-query query))))
    (doseq [query [{:update :auth_identity :set {:provider "changed"}}
                   {:update :auth_identity :set {:credentials "changed" :last_used_at nil :updated_at nil}}
                   {:insert-into :auth_identity :values [{:user_id 1}]}
                   {:delete-from :auth_identity}]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read-only" (compile-query query))))))

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

(deftest read-only-raw-writes-test
  (mt/with-temp [:model/Collection {id :id} {:name "original"}]
    (mt/with-temporary-setting-values [read-only-mode true]
      (let [query {:update :collection :set {:name "changed"} :where [:= :id id]}]
        (doseq [write! [#(t2/query query)
                        #(t2/query :model/Collection query)
                        ;; An exempt model argument must not override the actual target table.
                        #(t2/query :model/User query)
                        #(t2/query-one query)
                        #(into [] (t2/reducible-query query))]]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read-only" (write!)))))
      (is (= "original" (t2/select-one-fn :name :model/Collection id))))))

(deftest read-only-card-last-used-at-test
  (mt/with-temp [:model/Card {id :id} {:last_used_at #t "2025-01-01T00:00:00Z"}]
    (mt/with-temporary-setting-values [read-only-mode true]
      (qp.db/update-cards-last-used-at! {id (java.time.OffsetDateTime/now)})
      (is (not= #t "2025-01-01T00:00:00Z" (t2/select-one-fn :last_used_at :model/Card id))))))

(deftest read-only-disabled-test
  (mt/with-temp [:model/Collection {id :id} {:name "original"}]
    (mt/with-temporary-setting-values [read-only-mode false]
      (t2/query {:update :collection :set {:name "changed"} :where [:= :id id]})
      (is (= "changed" (t2/select-one-fn :name :model/Collection id))))))

(deftest read-only-keeps-honeysql-guard-test
  (mt/with-temporary-setting-values [read-only-mode true]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"forbidden HoneySQL"
                          (compile-query {:select [:*] :from [[{:select [:*] :from [:collection]} :c]]})))))

(deftest read-only-cold-setting-cache-test
  (mt/with-temporary-setting-values [read-only-mode true]
    (reset! (#'setting.cache/cache*) nil)
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read-only"
                          (t2/query {:update :collection :set {:name "changed"} :where [:= :id -1]})))))

(deftest read-only-user-creation-rolls-back-test
  (let [email (str (random-uuid) "@example.com")
        collection-count (t2/count :model/Collection)]
    (mt/with-temporary-setting-values [read-only-mode true]
      (is (re-find #"read-only"
                   (mt/user-http-request :crowberto :post 403 "user"
                                         {:email email :first_name "New" :last_name "User"})))
      (is (not (t2/exists? :model/User :email email)))
      (is (= collection-count (t2/count :model/Collection))))))

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
