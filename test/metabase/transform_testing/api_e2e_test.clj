(ns ^:mb/driver-tests metabase.transform-testing.api-e2e-test
  "End-to-end tests for `/api/transform-test`: HTTP in, a real warehouse out. The unit tests pin what
  each piece does; these pin that the seams hold — that a test authored over the API is the test the
  runner runs, and that a refusal reaches the client as a refusal."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transform-testing.test-util :as transform-testing.test-util]
   [toucan2.core :as t2]))

(defmacro ^:private with-transforms-enabled
  "Body with `features` licensed and the transforms setting on."
  [features & body]
  `(mt/with-premium-features ~features
     (mt/with-temporary-raw-setting-values [~'transforms-enabled "true"]
       ~@body)))

(defn- with-people-transform
  "Call `f` with the schema and name of the people table and the id of a transform selecting `id, name`
  from it into `people_summary`."
  [f]
  (let [mp                            (mt/metadata-provider)
        {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))]
    (mt/with-temp [:model/Transform {transform-id :id}
                   {:source {:type  "query"
                             :query (lib/native-query mp (str "SELECT id, name FROM " schema "." table))}
                    :target {:type     "table"
                             :schema   schema
                             :name     "people_summary"
                             :database (mt/id)}}]
      (f schema table transform-id))))

(defn- outcomes
  "The identifying keys of each expectation result, in reported order."
  [run-result]
  (mapv #(select-keys % [:name :type :status]) (:expectations run-result)))

(deftest transform-test-lifecycle-test
  (testing "author, read, run, edit, re-run and delete a transform test over the API"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
      (with-transforms-enabled #{:transforms-basic}
        (with-people-transform
          (fn [schema table transform-id]
            (let [input   {:table  {:schema schema :name table}
                           :format "sql"
                           :sql    "SELECT 1 AS id, 'abc' AS name"}
                  passing {:type "empty"
                           :name "no null ids"
                           :sql  (str "SELECT * FROM " schema ".people_summary WHERE id IS NULL")}
                  ;; The output row is (1, 'abc'), so this one differs in a single cell.
                  [int-type text-type] (transform-testing.test-util/cast-types)
                  failing {:type    "equals"
                           :name    "output"
                           :format  "rows"
                           :columns [{:name "id" :database_type int-type}
                                     {:name "name" :database_type text-type}]
                           :rows    [{"id" 1 "name" "xyz"}]}
                  created (mt/user-http-request :crowberto :post 200 "transform-test"
                                                {:transform_id transform-id
                                                 :name         "End to end"
                                                 :inputs       [input]
                                                 :expectations [passing]})
                  path    (str "transform-test/" (:id created))]
              (try
                (testing "POST stores the test against the transform, owned by the caller"
                  (is (=? {:id           pos-int?
                           :transform_id transform-id
                           :creator_id   (mt/user->id :crowberto)
                           :name         "End to end"}
                          created)))
                (testing "GET returns what POST created"
                  (is (= created (mt/user-http-request :crowberto :get 200 path))))
                (testing "running a passing test"
                  (let [result (mt/user-http-request :crowberto :post 200 (str path "/run"))]
                    (is (= #{:status :expectations :tables} (set (keys result))))
                    (is (= "passed" (:status result)))
                    (is (= [{:name "no null ids" :type "empty" :status "passed"}]
                           (outcomes result)))))
                (testing "PUT replaces the expectations"
                  (is (=? {:expectations [{:name "no null ids"} {:name "output"}]}
                          (mt/user-http-request :crowberto :put 200 path
                                                {:expectations [passing failing]}))))
                (testing "every expectation reports, and one failure fails the run"
                  (let [result      (mt/user-http-request :crowberto :post 200 (str path "/run"))
                        [pass fail] (:expectations result)]
                    (is (= "failed" (:status result)))
                    (is (= [{:name "no null ids" :type "empty"  :status "passed"}
                            {:name "output"      :type "equals" :status "failed"}]
                           (outcomes result)))
                    (testing "the failing one carries its own detail"
                      (is (= [{:column "name" :expected "xyz" :actual "abc"}]
                             (:cell-mismatches fail))))
                    (testing "the passing one carries none"
                      (is (nil? (:cell-mismatches pass))))))
                (testing "DELETE removes the test"
                  (mt/user-http-request :crowberto :delete 204 path)
                  (is (not (t2/exists? :model/TransformTest (:id created))))
                  (mt/user-http-request :crowberto :get 404 path))
                (finally
                  (t2/delete! :model/TransformTest :id (:id created)))))))))))

(deftest run-refusal-test
  (testing "a non-200 from the run endpoint means nothing ran"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
      (with-transforms-enabled #{:transforms-basic :transforms-python}
        (testing "422 — the environment prevents a run: not a query transform"
          (mt/with-temp [:model/Transform     {transform-id :id}
                         {:source {:type "python" :source-database (mt/id)}}
                         :model/TransformTest {test-id :id} {:transform_id transform-id}]
            (let [response (mt/user-http-request :crowberto :post 422
                                                 (format "transform-test/%d/run" test-id))]
              (is (= "metabase.transform-testing.errors/unsupported-transform"
                     (:error-code response)))
              (is (string? (:message response)))
              ;; The structured branch of the exception middleware, so no stacktrace rides along —
              ;; which also means the body survives an instance with stacktraces suppressed.
              (is (not (contains? response :trace))))))
        (testing "400 — an authoring error: the transform reads a table with no declared input"
          (with-people-transform
            (fn [schema table transform-id]
              (mt/with-temp [:model/TransformTest {test-id :id}
                             {:transform_id transform-id :inputs [] :expectations []}]
                (let [response (mt/user-http-request :crowberto :post 400
                                                     (format "transform-test/%d/run" test-id))]
                  (is (= "metabase.transform-testing.errors/missing-inputs"
                         (:error-code response)))
                  (is (re-find (re-pattern (str "(?i)" table)) (:message response)))
                  ;; The refusal's own ex-data rides along, so the offending tables are readable as
                  ;; data and not only out of the prose. Derived from the metadata rather than
                  ;; written out: engines differ on the case they fold identifiers to.
                  (is (= [(str schema "." table)] (:tables response)))
                  (is (not (contains? response :trace))))))))))))

(deftest run-is-gated-test
  (with-transforms-enabled #{:transforms-basic}
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {test-id :id}      {:transform_id transform-id}]
      (let [run-path (format "transform-test/%d/run" test-id)]
        (testing "the routes are behind +auth"
          (is (= "Unauthenticated" (mt/client :get 401 "transform-test")))
          (is (= "Unauthenticated" (mt/client :post 401 run-path))))
        (testing "a user with no transform access cannot run someone else's test"
          (mt/user-http-request :rasta :post 403 run-path)
          (is (t2/exists? :model/TransformTest test-id)))))))
