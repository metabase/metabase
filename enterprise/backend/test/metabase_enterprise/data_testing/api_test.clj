(ns metabase-enterprise.data-testing.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :cast_type "INTEGER"}]
    :rows    [{"ID" 1}]}])

(def ^:private expectations
  [{:type "empty" :name "no rows" :sql "SELECT * FROM PUBLIC.PEOPLE_SUMMARY WHERE ID IS NULL"}])

(defn- transform
  "A transform reading the table `inputs` stands in for, writing the table `expectations` reads, so that a test of
  it is one the write endpoints accept."
  []
  {:source {:type  :query
            :query (lib/native-query (mt/metadata-provider) "SELECT ID, NAME FROM PUBLIC.PEOPLE")}
   :target {:type "table" :schema "PUBLIC" :name "PEOPLE_SUMMARY" :database (mt/id)}})

(defmacro ^:private with-transforms-enabled [& body]
  ;; advanced-permissions: the Data Analyst role only opens transform tests while the plan includes it
  `(mt/with-premium-features #{:advanced-permissions :transforms-basic :transforms-testing}
     (mt/with-temporary-raw-setting-values [~'transforms-enabled "true"]
       ~@body)))

(deftest premium-feature-test
  (testing "every endpoint refuses an instance without the feature"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/with-temp [:model/Transform     {transform-id :id} {}
                       :model/TransformTest {test-id :id}      {:transform_id transform-id}]
          (let [path (str "ee/transform-test/" test-id)
                body {:transform_id transform-id :name "t" :inputs [] :expectations []}]
            (doseq [request [[:get 402 "ee/transform-test"]
                             [:post 402 "ee/transform-test" body]
                             [:get 402 path]
                             [:put 402 path {:name "t"}]
                             [:delete 402 path]
                             [:post 402 (str path "/run")]
                             [:get 402 (str path "/run")]]]
              (mt/assert-has-premium-feature-error
               "Transforms Testing"
               (apply mt/user-http-request :crowberto request)))))))))

(deftest crud-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform {transform-id :id} (transform)
                   :model/Transform {other-id :id}     (transform)]
      (let [created (mt/user-http-request :crowberto :post 200 "ee/transform-test"
                                          {:transform_id transform-id
                                           :name         "My test"
                                           :description  "abc"
                                           :inputs       inputs
                                           :expectations expectations})
            path    (str "ee/transform-test/" (:id created))]
        (try
          (testing "POST creates the test as the current user"
            (is (=? {:id           pos-int?
                     :entity_id    string?
                     :transform_id transform-id
                     :creator_id   (mt/user->id :crowberto)
                     :name         "My test"
                     :description  "abc"
                     :inputs       [{:format "rows" :columns [{:name "ID" :cast_type "INTEGER"}] :rows [{:ID 1}]}]
                     :expectations expectations}
                    created)))
          (testing "GET returns the test"
            (is (= (assoc created :last_run nil) (mt/user-http-request :crowberto :get 200 path))))
          (testing "GET / filters by transform"
            (is (= [(:id created)]
                   (map :id (mt/user-http-request :crowberto :get 200 "ee/transform-test" :transform-id transform-id))))
            (is (= [] (mt/user-http-request :crowberto :get 200 "ee/transform-test" :transform-id other-id))))
          (testing "PUT changes only the given keys"
            (is (=? {:name "Renamed" :description "abc" :transform_id other-id}
                    (mt/user-http-request :crowberto :put 200 path {:name "Renamed" :transform_id other-id}))))
          (testing "DELETE removes the test"
            (mt/user-http-request :crowberto :delete 204 path)
            (is (not (t2/exists? :model/TransformTest :id (:id created))))
            (mt/user-http-request :crowberto :get 404 path))
          (finally
            (t2/delete! :model/TransformTest :id (:id created))))))))

(deftest rows-cells-keep-request-values-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform {transform-id :id} (transform)]
      (let [cells   {"ID" 1 "CODE" "0001" "FLAG" "true" "AMOUNT" "1.50" "RATE" 1.5 "ACTIVE" false "NOTE" nil}
            columns (mapv (fn [column] {:name column :cast_type "VARCHAR"}) (keys cells))
            created (mt/user-http-request :crowberto :post 200 "ee/transform-test"
                                          {:transform_id transform-id
                                           :name         "Cell values"
                                           :inputs       [(assoc (first inputs) :columns columns :rows [cells])]
                                           :expectations [{:type    "equals"
                                                           :name    "cells as written"
                                                           :format  "rows"
                                                           :columns columns
                                                           :rows    [cells]}]})]
        (try
          (testing "strings that read as numbers or booleans stay strings, and other values keep their type"
            (let [expected (update-keys cells keyword)]
              (is (= [expected] (-> created :inputs first :rows)))
              (is (= [expected] (-> created :expectations first :rows)))
              (is (= [expected] (-> (mt/user-http-request :crowberto :get 200 (str "ee/transform-test/" (:id created)))
                                    :inputs first :rows)))))
          (finally
            (t2/delete! :model/TransformTest :id (:id created))))))))

(deftest write-endpoints-refuse-a-test-that-could-not-run-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform {transform-id :id} (transform)]
      (testing "POST refuses a test the runner would refuse, as that refusal"
        (let [response (mt/user-http-request :crowberto :post 400 "ee/transform-test"
                                             {:transform_id transform-id
                                              :name         "no inputs"
                                              :inputs       []
                                              :expectations expectations})]
          (is (= "transform-test.missing-inputs" (:error-code response)))
          (is (= ["PUBLIC.PEOPLE"] (:tables response)))
          (is (not (t2/exists? :model/TransformTest :name "no inputs")))))
      (testing "and an expectation reading a table the test does not stand in for"
        (let [response (mt/user-http-request :crowberto :post 400 "ee/transform-test"
                                             {:transform_id transform-id
                                              :name         "leaky expectation"
                                              :inputs       inputs
                                              :expectations [{:type "empty" :name "leaks"
                                                              :sql  "SELECT * FROM PUBLIC.ORDERS"}]})]
          (is (= "transform-test.unremapped-reference" (:error-code response)))))
      (testing "PUT refuses an update that would leave the test unrunnable, and changes nothing"
        (mt/with-temp [:model/TransformTest {test-id :id} {:transform_id transform-id
                                                           :name         "My test"
                                                           :inputs       inputs
                                                           :expectations expectations}]
          (let [path     (str "ee/transform-test/" test-id)
                response (mt/user-http-request :crowberto :put 400 path {:inputs []})]
            (is (= "transform-test.missing-inputs" (:error-code response)))
            (is (= (:inputs (t2/select-one :model/TransformTest :id test-id))
                   (mapv #(update % :format keyword) inputs))))
          (testing "while an update that touches nothing a run reads is let through"
            (is (=? {:name "Renamed"}
                    (mt/user-http-request :crowberto :put 200 (str "ee/transform-test/" test-id)
                                          {:name "Renamed"})))))))))

(deftest no-expectations-test
  (mt/test-driver :h2
    (with-transforms-enabled
      (mt/with-temp [:model/Transform     {transform-id :id} (transform)
                     :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                              :inputs       inputs
                                                              :expectations expectations}
                     :model/TransformTest {empty-id :id}     {:transform_id transform-id
                                                              :inputs       inputs
                                                              :expectations []}]
        (let [refused (fn [response]
                        (is (= "transform-test.no-expectations" (:error-code response))))]
          (testing "create refuses a test with no expectations"
            (refused (mt/user-http-request :crowberto :post 400 "ee/transform-test"
                                           {:transform_id transform-id :name "t" :inputs inputs :expectations []})))
          (testing "update refuses to remove every expectation"
            (refused (mt/user-http-request :crowberto :put 400 (str "ee/transform-test/" test-id)
                                           {:expectations []})))
          (testing "an unsaved run refuses a test with no expectations"
            (refused (mt/user-http-request :crowberto :post 400 "ee/transform-test/run"
                                           {:transform (assoc (transform) :name "t")
                                            :test      {:name "t" :inputs inputs :expectations []}})))
          (testing "a saved test with no expectations can still be read"
            (is (=? {:id empty-id :expectations []}
                    (mt/user-http-request :crowberto :get 200 (str "ee/transform-test/" empty-id)))))
          (testing "a saved test with no expectations is refused when it runs"
            (refused (mt/user-http-request :crowberto :post 400 (format "ee/transform-test/%d/run" empty-id)))))))))

(deftest no-expectations-refusal-writes-nothing-test
  (mt/test-driver :h2
    (with-transforms-enabled
      (mt/with-temp [:model/Transform     {transform-id :id} {:source {:type  :query
                                                                       :query (lib/native-query (mt/metadata-provider)
                                                                                                "SELECT ID FROM PUBLIC.PEOPLE")}
                                                              :target {:type     "table"
                                                                       :schema   "PUBLIC"
                                                                       :name     "PEOPLE_SUMMARY"
                                                                       :database (mt/id)}}
                     :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                              :inputs       inputs
                                                              :expectations expectations}
                     :model/TransformTest {empty-id :id}     {:transform_id transform-id
                                                              :inputs       inputs
                                                              :expectations []}]
        (try
          (testing "a test of the same transform with an expectation runs and passes"
            (is (= "passed" (:status (mt/user-http-request :crowberto :post 200 (format "ee/transform-test/%d/run" test-id))))))
          (testing "a refused create stores no test"
            (let [before (t2/count :model/TransformTest :transform_id transform-id)]
              (mt/user-http-request :crowberto :post "ee/transform-test"
                                    {:transform_id transform-id :name "no expectations" :inputs inputs :expectations []})
              (is (= before (t2/count :model/TransformTest :transform_id transform-id)))))
          (testing "a refused update keeps the stored expectations"
            (mt/user-http-request :crowberto :put (str "ee/transform-test/" test-id) {:expectations []})
            (is (= ["no rows"] (mapv :name (t2/select-one-fn :expectations :model/TransformTest :id test-id)))))
          (testing "a refused saved run records no run"
            (let [before (t2/count :model/TransformTestRun :transform_test_id empty-id)]
              (mt/user-http-request :crowberto :post (format "ee/transform-test/%d/run" empty-id))
              (is (= before (t2/count :model/TransformTestRun :transform_test_id empty-id)))))
          (finally
            (t2/delete! :model/TransformTest :transform_id transform-id :id [:not-in [test-id empty-id]])))))))

(deftest validation-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {test-id :id}      {:transform_id transform-id}]
      (let [valid {:transform_id transform-id :name "t" :inputs [] :expectations []}]
        (testing "inputs and expectations are required on create"
          (mt/user-http-request :crowberto :post 400 "ee/transform-test" (dissoc valid :inputs :expectations)))
        (testing "rows data needs columns"
          (mt/user-http-request :crowberto :post 400 "ee/transform-test"
                                (assoc valid :inputs [{:table {:name "PEOPLE"} :format "rows" :rows []}])))
        (testing "expectations need a name"
          (mt/user-http-request :crowberto :post 400 "ee/transform-test"
                                (assoc valid :expectations [{:type "empty" :sql "SELECT 1"}])))
        (testing "transform must exist"
          (mt/user-http-request :crowberto :post 403 "ee/transform-test" (assoc valid :transform_id Integer/MAX_VALUE))
          (mt/user-http-request :crowberto :put 403 (str "ee/transform-test/" test-id) {:transform_id Integer/MAX_VALUE}))))))

(deftest run-transform-test-endpoint-test
  (mt/test-driver :h2
    (with-transforms-enabled
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:source {:type  :query
                               :query (lib/native-query (mt/metadata-provider) "SELECT ID, NAME FROM PUBLIC.PEOPLE")}
                      :target {:type "table" :schema "PUBLIC" :name "PEOPLE_SUMMARY" :database (mt/id)}}]
        (let [run (fn [expected-status transform-test]
                    (mt/with-temp [:model/TransformTest {test-id :id} (assoc transform-test :transform_id transform-id)]
                      (mt/user-http-request :crowberto :post expected-status (format "ee/transform-test/%d/run" test-id))))
              input {:table {:schema "PUBLIC" :name "PEOPLE"} :format :sql :sql "SELECT 1 AS ID, 'abc' AS NAME"}]
          (testing "returns passed when every expectation passes"
            (let [result (run 200 {:inputs       [input]
                                   :expectations [{:type :empty :name "one id" :sql "SELECT * FROM PUBLIC.PEOPLE_SUMMARY WHERE ID <> 1"}]})]
              (is (= "passed" (:status result)))
              (is (= [{:name "one id" :type "empty" :status "passed"}]
                     (:expectations result)))))
          (testing "returns failed when an expectation fails"
            (let [result (run 200 {:inputs       [input]
                                   :expectations [{:type :empty :name "no abc" :sql "SELECT * FROM PUBLIC.PEOPLE_SUMMARY WHERE NAME = 'abc'"}]})]
              (is (= "failed" (:status result)))
              (is (= ["no abc"] (mapv :name (:expectations result))))
              (testing "the sample names its cells rather than making the reader zip them"
                (is (= [{:ID 1 :NAME "abc"}] (mapv (comp first :sample) (:expectations result)))))
              (testing "and the columns carry the warehouse's own type for each"
                (is (= [[{:name "ID" :database_type "INTEGER"}
                         {:name "NAME" :database_type "CHARACTER VARYING"}]]
                       (mapv :columns (:expectations result)))))))
          (testing "rejects a test that doesn't replace every table the transform reads"
            (run 400 {:inputs [] :expectations []})))))))

(defn- people-id-transform
  "An MBQL transform selecting `ID` from `PEOPLE` into `PEOPLE_SUMMARY`."
  []
  (let [mp (mt/metadata-provider)]
    {:source {:type  :query
              :query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                         (lib/with-fields [(lib.metadata/field mp (mt/id :people :id))]))}
     :target {:type "table" :schema "PUBLIC" :name "PEOPLE_SUMMARY" :database (mt/id)}}))

(deftest permissions-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform     {transform-id :id} (people-id-transform)
                   :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                            :inputs       inputs
                                                            :expectations expectations}]
      (let [path  (str "ee/transform-test/" test-id)
            body  {:transform_id transform-id :name "nope" :inputs inputs :expectations expectations}
            adhoc {:transform (assoc (people-id-transform) :name "adhoc")
                   :test      {:name "adhoc" :inputs inputs :expectations expectations}}
            refused-writes (fn [user]
                             (mt/user-http-request user :post 403 "ee/transform-test" body)
                             (mt/user-http-request user :put 403 path {:name "nope"})
                             (mt/user-http-request user :delete 403 path)
                             (mt/user-http-request user :post 403 "ee/transform-test/run" adhoc))]
        (try
          (testing "users without transform access can't read, change, or run transform tests"
            (mt/user-http-request :rasta :get 403 "ee/transform-test")
            (mt/user-http-request :rasta :get 403 path)
            (mt/user-http-request :rasta :post 403 (str path "/run"))
            (refused-writes :rasta))
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (testing "data analysts who can read transform can read and run its tests"
              (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :no
                                                                            :perms/create-queries :query-builder}
                (is (some #{test-id} (map :id (mt/user-http-request :lucky :get 200 "ee/transform-test"))))
                (mt/user-http-request :lucky :get 200 path)
                (is (= "passed" (:status (mt/user-http-request :lucky :post 200 (str path "/run")))))))
            (testing "saving, deleting, or running unsaved tests needs transforms permission on source database"
              (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :no
                                                                            :perms/create-queries :query-builder-and-native}
                (refused-writes :lucky)))
            (testing "saving, deleting, or running unsaved tests needs native access to source database"
              (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :yes
                                                                            :perms/create-queries :query-builder}
                (refused-writes :lucky)))
            (testing "with both, data analysts can change tests and run unsaved ones"
              (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/transforms     :yes
                                                                            :perms/create-queries :query-builder-and-native}
                (is (=? {:name "renamed"} (mt/user-http-request :lucky :put 200 path {:name "renamed"})))
                (is (= "passed" (:status (mt/user-http-request :lucky :post 200 "ee/transform-test/run" adhoc)))))))
          (is (t2/exists? :model/TransformTest :id test-id))
          (finally
            (t2/delete! :model/TransformTestRun :initiated_by (mt/user->id :lucky))))))))

(def ^:private orders-input
  [{:table  {:schema "PUBLIC" :name "PEOPLE"}
    :format "sql"
    :sql    "SELECT ID FROM PUBLIC.ORDERS WHERE ID <= 3"}])

(deftest adhoc-run-respects-tables-blocked-by-other-group-test
  (testing "unsaved tests cannot read tables another group of caller blocks"
    (with-transforms-enabled
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (perms.tu/with-no-data-perms-for-all-users!
          (perms.tu/with-restored-data-perms-for-group! (:id (perms-group/all-users))
            (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                           :model/PermissionsGroupMembership _              {:group_id group-id :user_id (mt/user->id :lucky)}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/transforms :yes)
              (data-perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/view-data :legacy-no-self-service)
              (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
              (data-perms/set-table-permission! group-id (mt/id :orders) :perms/view-data :blocked)
              (mt/user-http-request :lucky :post 403 "ee/transform-test/run"
                                    {:transform (assoc (people-id-transform) :name "adhoc")
                                     :test      {:name "adhoc" :inputs orders-input :expectations expectations}}))))))))

(deftest update-transform-id-needs-access-to-both-transforms-test
  (testing "moving test to another transform needs permission to save tests of both transforms"
    (with-transforms-enabled
      (mt/with-temp [:model/Database      {other-db-id :id}  {}
                     :model/Transform     {transform-id :id} (people-id-transform)
                     :model/Transform     {other-id :id}     {:source {:type  :query
                                                                       :query (lib/native-query (lib-be/application-database-metadata-provider other-db-id) "SELECT 1")}}
                     :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                              :inputs       inputs
                                                              :expectations expectations}]
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (perms.tu/with-no-data-perms-for-all-users!
            (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                          :perms/transforms     :yes
                                                                          :perms/create-queries :query-builder-and-native}
              (let [path (str "ee/transform-test/" test-id)]
                (mt/user-http-request :lucky :put 403 path {:transform_id other-id})
                (is (= transform-id (t2/select-one-fn :transform_id :model/TransformTest :id test-id)))
                (is (=? {:name "renamed"} (mt/user-http-request :lucky :put 200 path {:name "renamed"})))))))))))

(deftest list-runs-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform        {transform-id :id} {}
                   :model/TransformTest    {test-id :id}      {:transform_id transform-id}
                   :model/TransformTest    {other-id :id}     {:transform_id transform-id}
                   :model/TransformTestRun {old-id :id}       {:transform_test_id test-id
                                                               :status            :passed
                                                               :start_time        #t "2026-01-01T10:00:00Z"
                                                               :end_time          #t "2026-01-01T10:00:02Z"}
                   :model/TransformTestRun {failed-id :id}    {:transform_test_id test-id
                                                               :initiated_by      (mt/user->id :crowberto)
                                                               :status            :failed
                                                               :start_time        #t "2026-02-01T10:00:00Z"
                                                               :end_time          #t "2026-02-01T10:00:02Z"}
                   :model/TransformTestRun {new-id :id}       {:transform_test_id test-id
                                                               :status            :passed
                                                               :start_time        #t "2026-03-01T10:00:00Z"
                                                               :end_time          #t "2026-03-01T10:00:02Z"}
                   :model/TransformTestRun _                  {:transform_test_id other-id
                                                               :status            :error
                                                               :start_time        #t "2026-04-01T10:00:00Z"}]
      (let [path (str "ee/transform-test/" test-id "/run")]
        (testing "lists the runs of the test, newest first, with who started them"
          (is (=? {:data   [{:id new-id :status "passed" :initiated_by_user nil}
                            {:id failed-id :status "failed" :initiated_by_user {:common_name "Crowberto Corv"}}
                            {:id old-id :status "passed"}]
                   :total  3
                   :offset 0}
                  (mt/user-http-request :crowberto :get 200 path))))
        (testing "pages"
          (is (=? {:data [{:id failed-id}] :total 3 :limit 1 :offset 1}
                  (mt/user-http-request :crowberto :get 200 path :limit 1 :offset 1))))
        (testing "filters by status"
          (is (=? {:data [{:id failed-id}] :total 1}
                  (mt/user-http-request :crowberto :get 200 path :statuses "failed"))))
        (testing "filters by start and end time"
          (is (=? {:data [{:id failed-id}] :total 1}
                  (mt/user-http-request :crowberto :get 200 path :start-time "2026-02-01~2026-02-28")))
          (is (=? {:data [{:id new-id}] :total 1}
                  (mt/user-http-request :crowberto :get 200 path :end-time "2026-03-01"))))
        (testing "refuses users who can't read the test"
          (mt/user-http-request :rasta :get 403 path))))))

(deftest last-run-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform        {transform-id :id} {}
                   :model/TransformTest    {test-id :id}      {:transform_id transform-id :name "a"}
                   :model/TransformTest    {never-id :id}     {:transform_id transform-id :name "b"}
                   :model/TransformTestRun _                  {:transform_test_id test-id
                                                               :status            :passed
                                                               :start_time        #t "2026-01-01T10:00:00Z"}
                   :model/TransformTestRun {new-id :id}       {:transform_test_id test-id
                                                               :status            :failed
                                                               :start_time        #t "2026-02-01T10:00:00Z"}]
      (testing "the list carries each test's newest run"
        (is (=? [{:id test-id :last_run {:id new-id :status "failed"}}
                 {:id never-id :last_run nil}]
                (mt/user-http-request :crowberto :get 200 "ee/transform-test" :transform-id transform-id))))
      (testing "a single test carries its newest run"
        (is (=? {:id test-id :last_run {:id new-id}}
                (mt/user-http-request :crowberto :get 200 (str "ee/transform-test/" test-id))))))))
