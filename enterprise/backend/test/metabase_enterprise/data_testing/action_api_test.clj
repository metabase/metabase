(ns ^:mb/driver-tests metabase-enterprise.data-testing.action-api-test
  "`/api/ee/action-test`. A run modifies tables, and H2 has no dialect to check a write in, so these run on Postgres."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- inputs
  "An input standing in for the categories table with categories 1 `Toy` and 2 `Food`."
  []
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id :categories))]
    [{:table   {:schema schema :name name}
      :format  "rows"
      :columns [{:name "id" :cast_type "INTEGER"} {:name "name" :cast_type "VARCHAR"}]
      :rows    [{"id" 1 "name" "Toy"} {"id" 2 "name" "Food"}]}]))

(defn- expectations
  "An expectation that the default query action, with `id` 1 and `name` `Wood`, renamed category 1 only."
  []
  (let [{:keys [schema name]} (lib.metadata/table (mt/metadata-provider) (mt/id :categories))]
    [{:type "empty"
      :name "only category 1 is renamed"
      :sql  (format "SELECT * FROM %s.%s WHERE (id = 1 AND name <> 'Wood Shop') OR (id = 2 AND name <> 'Food')"
                    schema name)}]))

(def ^:private parameters
  {"id" 1 "name" "Wood"})

(defn- body
  [action-id]
  {:action_id action-id :name "My test" :parameters parameters :inputs (inputs) :expectations (expectations)})

(defn- do-with-action!
  "Call `f` with the id of a query action of a model in the collection `collection-id` (nil for the root), with actions
  enabled on the Postgres test database."
  [collection-id f]
  (mt/test-driver :postgres
    (mt/with-actions-enabled
      (mt/with-actions [_                   {:type :model :dataset_query (data-testing.test-util/categories-query)
                                             :collection_id collection-id}
                        {:keys [action-id]} {}]
        (f action-id)))))

(deftest premium-feature-test
  (testing "every endpoint refuses an instance without the feature"
    (mt/with-premium-features #{}
      (do-with-action! nil (fn [action-id]
                             (mt/with-temp [:model/ActionTest {test-id :id} {:action_id action-id}]
                               (let [path (str "ee/action-test/" test-id)]
                                 (doseq [request [[:get 402 "ee/action-test"]
                                                  [:post 402 "ee/action-test" (body action-id)]
                                                  [:get 402 path]
                                                  [:put 402 path {:name "t"}]
                                                  [:delete 402 path]
                                                  [:post 402 (str path "/run")]]]
                                   (mt/assert-has-premium-feature-error
                                    "Transforms Testing"
                                    (apply mt/user-http-request :crowberto request))))))))))

(deftest crud-test
  (mt/with-premium-features #{:transforms-testing}
    (do-with-action! nil (fn [action-id]
                           (let [created (mt/user-http-request :crowberto :post 200 "ee/action-test" (assoc (body action-id) :description "abc"))
                                 path    (str "ee/action-test/" (:id created))]
                             (try
                               (testing "POST creates the test, with its parameter values, as the current user"
                                 (is (=? {:id           pos-int?
                                          :entity_id    string?
                                          :action_id    action-id
                                          :creator_id   (mt/user->id :crowberto)
                                          :name         "My test"
                                          :description  "abc"
                                          :parameters   {:id 1 :name "Wood"}
                                          :expectations (expectations)}
                                         created)))
                               (testing "GET returns the test with its newest run"
                                 (is (= (assoc created :last_run nil) (mt/user-http-request :crowberto :get 200 path))))
                               (testing "GET / filters by action"
                                 (is (= [(:id created)]
                                        (map :id (mt/user-http-request :crowberto :get 200 "ee/action-test" :action-id action-id))))
                                 (is (= [] (mt/user-http-request :crowberto :get 200 "ee/action-test" :action-id (inc action-id)))))
                               (testing "PUT changes only the given keys"
                                 (is (=? {:name "Renamed" :description "abc" :parameters {:id 1 :name "Wood"}}
                                         (mt/user-http-request :crowberto :put 200 path {:name "Renamed"}))))
                               (testing "DELETE removes the test"
                                 (mt/user-http-request :crowberto :delete 204 path)
                                 (is (not (t2/exists? :model/ActionTest :id (:id created))))
                                 (mt/user-http-request :crowberto :get 404 path))
                               (finally
                                 (t2/delete! :model/ActionTest :id (:id created)))))))))

(deftest write-endpoints-refuse-a-test-that-could-not-run-test
  (mt/with-premium-features #{:transforms-testing}
    (do-with-action! nil (fn [action-id]
                           (mt/with-temp [:model/ActionTest {test-id :id} (dissoc (body action-id) :name)]
                             (testing "POST refuses a test missing an input, under the action-test error prefix"
                               (is (= "action-test.missing-inputs"
                                      (:error-code (mt/user-http-request :crowberto :post 400 "ee/action-test" (assoc (body action-id) :inputs []))))))
                             (testing "POST refuses a value for no parameter of the action"
                               (is (= "action-test.invalid-parameters"
                                      (:error-code (mt/user-http-request :crowberto :post 400 "ee/action-test"
                                                                         (assoc (body action-id) :parameters {"id" 1 "colour" "red"}))))))
                             (testing "POST refuses an `equals` expectation: an action has no output"
                               (is (= "action-test.no-output"
                                      (:error-code (mt/user-http-request :crowberto :post 400 "ee/action-test"
                                                                         (assoc (body action-id) :expectations
                                                                                [{:type "equals" :name "e" :format "rows"
                                                                                  :columns [{:name "id" :cast_type "INTEGER"}]
                                                                                  :rows [{"id" 1}]}]))))))
                             (testing "PUT refuses a change that makes the test unrunnable, and keeps the test"
                               (is (= "action-test.invalid-parameters"
                                      (:error-code (mt/user-http-request :crowberto :put 400 (str "ee/action-test/" test-id)
                                                                         {:parameters {"colour" "red"}}))))
                               (is (= {"id" 1 "name" "Wood"} (:parameters (t2/select-one :model/ActionTest :id test-id))))))))))

(deftest run-saved-test-test
  (mt/with-premium-features #{:transforms-testing}
    (do-with-action! nil (fn [action-id]
                           ;; A run counts as the test's run only if it started after the test was created. The with-temp default for
                           ;; `created_at` is the JVM's clock and the run's start time is the app DB's, so the test is dated in the past.
                           (mt/with-temp [:model/ActionTest {test-id :id} (assoc (body action-id) :created_at #t "2025-01-01T00:00:00Z")]
                             (let [path (str "ee/action-test/" test-id)]
                               (try
                                 (testing "a run reports each expectation"
                                   (is (=? {:status       "passed"
                                            :expectations [{:name "only category 1 is renamed" :status "passed"}]}
                                           (mt/user-http-request :crowberto :post 200 (str path "/run")))))
                                 (testing "the run is the test's newest run, and is in the run history of action tests"
                                   (let [{:keys [last_run]} (mt/user-http-request :crowberto :get 200 path)]
                                     (is (=? {:test_type "action" :test_id test-id :status "passed"} last_run))
                                     (is (= [(:id last_run)]
                                            (map :id (:data (mt/user-http-request :crowberto :get 200 "ee/data-test-run"
                                                                                  :test-type "action" :test-id test-id)))))))
                                 (testing "the real table is not written"
                                   (is (= [] (data-testing.test-util/renamed-categories "Wood Shop"))))
                                 (testing "a run on a database with actions turned off is refused"
                                   (mt/with-actions-disabled
                                     (is (= "action-test.actions-disabled"
                                            (:error-code (mt/user-http-request :crowberto :post 422 (str path "/run")))))))
                                 (finally
                                   (t2/delete! :model/DataTestRun :test_type "action" :test_id test-id)))))))))

(deftest permissions-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-non-admin-groups-no-root-collection-perms
      (perms.tu/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Collection {coll-id :id} {}]
          (do-with-action! coll-id (fn [action-id]
                                     (mt/with-temp [:model/ActionTest {test-id :id} (assoc (body action-id) :created_at #t "2025-01-01T00:00:00Z")]
                                       (let [path (str "ee/action-test/" test-id)]
                                         (try
                                           (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                                                         :perms/create-queries :query-builder-and-native}
                                             (testing "no collection access to the action: 403 on get and on run"
                                               (mt/user-http-request :rasta :get 403 path)
                                               (mt/user-http-request :rasta :post 403 (str path "/run")))
                                             (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
                                             (testing "collection access: get and run, but not create, update or delete, since only a superuser changes an action"
                                               (is (= test-id (:id (mt/user-http-request :rasta :get 200 path))))
                                               (is (= "passed" (:status (mt/user-http-request :rasta :post 200 (str path "/run")))))
                                               (mt/user-http-request :rasta :post 403 "ee/action-test" (body action-id))
                                               (mt/user-http-request :rasta :put 403 path {:name "nope"})
                                               (mt/user-http-request :rasta :delete 403 path)))
                                           (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                                                         :perms/create-queries :query-builder}
                                             (testing "no native queries on the action's database: 403 on run"
                                               (mt/user-http-request :rasta :post 403 (str path "/run"))
                                               (is (= test-id (:id (mt/user-http-request :rasta :get 200 path))))))
                                           (finally
                                             (t2/delete! :model/DataTestRun :test_type "action" :test_id test-id))))))))))))

(deftest deleting-an-action-deletes-its-tests-test
  (mt/with-premium-features #{:transforms-testing}
    (do-with-action! nil (fn [action-id]
                           (let [{test-id :id} (t2/insert-returning-instance! :model/ActionTest (assoc (body action-id)
                                                                                                       :creator_id (mt/user->id :crowberto)))]
                             (mt/with-temp [:model/DataTestRun {run-id :id} {:test_type :action :test_id test-id}]
                               (t2/delete! :model/Action :id action-id)
                               (testing "the action's tests are deleted with it"
                                 (is (not (t2/exists? :model/ActionTest :id test-id))))
                               (testing "through the test's own delete hook, which keeps no run naming the deleted test"
                                 (is (nil? (t2/select-one-fn :test_id :model/DataTestRun :id run-id))))))))))

