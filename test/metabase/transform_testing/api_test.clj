(ns metabase.transform-testing.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :database_type "INTEGER"}]
    :rows    [{"ID" 1}]}])

(def ^:private expectations
  [{:type "empty" :name "no rows" :sql "SELECT * FROM PUBLIC.PEOPLE_SUMMARY WHERE ID IS NULL"}])

(defmacro ^:private with-transforms-enabled [& body]
  `(mt/with-premium-features #{:transforms-basic}
     (mt/with-temporary-raw-setting-values [~'transforms-enabled "true"]
       ~@body)))

(deftest crud-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform {transform-id :id} {}
                   :model/Transform {other-id :id}     {}]
      (let [created (mt/user-http-request :crowberto :post 200 "transform-test"
                                          {:transform_id transform-id
                                           :name         "My test"
                                           :description  "abc"
                                           :inputs       inputs
                                           :expectations expectations})
            path    (str "transform-test/" (:id created))]
        (try
          (testing "POST creates the test as the current user"
            (is (=? {:id           pos-int?
                     :entity_id    string?
                     :transform_id transform-id
                     :creator_id   (mt/user->id :crowberto)
                     :name         "My test"
                     :description  "abc"
                     :inputs       [{:format "rows" :columns [{:name "ID" :database_type "INTEGER"}] :rows [{:ID 1}]}]
                     :expectations expectations}
                    created)))
          (testing "GET returns the test"
            (is (= created (mt/user-http-request :crowberto :get 200 path))))
          (testing "GET / filters by transform"
            (is (= [(:id created)]
                   (map :id (mt/user-http-request :crowberto :get 200 "transform-test" :transform-id transform-id))))
            (is (= [] (mt/user-http-request :crowberto :get 200 "transform-test" :transform-id other-id))))
          (testing "PUT changes only the given keys"
            (is (=? {:name "Renamed" :description "abc" :transform_id other-id}
                    (mt/user-http-request :crowberto :put 200 path {:name "Renamed" :transform_id other-id}))))
          (testing "DELETE removes the test"
            (mt/user-http-request :crowberto :delete 204 path)
            (is (not (t2/exists? :model/TransformTest (:id created))))
            (mt/user-http-request :crowberto :get 404 path))
          (finally
            (t2/delete! :model/TransformTest (:id created))))))))

(deftest validation-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {test-id :id}      {:transform_id transform-id}]
      (let [valid {:transform_id transform-id :name "t" :inputs [] :expectations []}]
        (testing "inputs and expectations are required on create"
          (mt/user-http-request :crowberto :post 400 "transform-test" (dissoc valid :inputs :expectations)))
        (testing "rows data needs columns"
          (mt/user-http-request :crowberto :post 400 "transform-test"
                                (assoc valid :inputs [{:table {:name "PEOPLE"} :format "rows" :rows []}])))
        (testing "expectations need a name"
          (mt/user-http-request :crowberto :post 400 "transform-test"
                                (assoc valid :expectations [{:type "empty" :sql "SELECT 1"}])))
        (testing "the transform must exist"
          (mt/user-http-request :crowberto :post 404 "transform-test" (assoc valid :transform_id Integer/MAX_VALUE))
          (mt/user-http-request :crowberto :put 404 (str "transform-test/" test-id) {:transform_id Integer/MAX_VALUE}))))))

(deftest run-transform-test-endpoint-test
  (mt/test-driver :h2
    (with-transforms-enabled
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:source {:type  "query"
                               :query (lib/native-query (mt/metadata-provider) "SELECT ID, NAME FROM PUBLIC.PEOPLE")}
                      :target {:type "table" :schema "PUBLIC" :name "PEOPLE_SUMMARY" :database (mt/id)}}]
        (let [run (fn [expected-status transform-test]
                    (mt/with-temp [:model/TransformTest {test-id :id} (assoc transform-test :transform_id transform-id)]
                      (mt/user-http-request :crowberto :post expected-status (format "transform-test/%d/run" test-id))))
              input {:table {:schema "PUBLIC" :name "PEOPLE"} :format :sql :sql "SELECT 1 AS ID, 'abc' AS NAME"}]
          (testing "returns passed when every expectation passes"
            (is (= {:status "passed"}
                   (run 200 {:inputs       [input]
                             :expectations [{:type :empty :name "one id" :sql "SELECT * FROM PUBLIC.PEOPLE_SUMMARY WHERE ID <> 1"}]}))))
          (testing "returns failed when an expectation fails"
            (is (= {:status "failed"}
                   (run 200 {:inputs       [input]
                             :expectations [{:type :empty :name "no abc" :sql "SELECT * FROM PUBLIC.PEOPLE_SUMMARY WHERE NAME = 'abc'"}]}))))
          (testing "rejects a test that doesn't replace every table the transform reads"
            (run 400 {:inputs [] :expectations []})))))))

(deftest permissions-test
  (with-transforms-enabled
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {test-id :id}      {:transform_id transform-id}]
      (let [path (str "transform-test/" test-id)
            body {:transform_id transform-id :name "nope" :inputs [] :expectations []}]
        (testing "users without transform access can't read or change transform tests"
          (mt/user-http-request :rasta :get 403 "transform-test")
          (mt/user-http-request :rasta :get 403 path)
          (mt/user-http-request :rasta :post 403 "transform-test" body)
          (mt/user-http-request :rasta :put 403 path {:name "nope"})
          (mt/user-http-request :rasta :delete 403 path)
          (mt/user-http-request :rasta :post 403 (str path "/run")))
        (testing "data analysts who can read but not write the transform can read but not change its tests"
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (is (some #{test-id} (map :id (mt/user-http-request :lucky :get 200 "transform-test"))))
            (mt/user-http-request :lucky :get 200 path)
            (mt/user-http-request :lucky :post 403 "transform-test" body)
            (mt/user-http-request :lucky :put 403 path {:name "nope"})
            (mt/user-http-request :lucky :delete 403 path)
            (mt/user-http-request :lucky :post 403 (str path "/run"))))
        (is (t2/exists? :model/TransformTest test-id))))))
