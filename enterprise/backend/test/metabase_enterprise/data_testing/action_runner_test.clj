(ns ^:mb/driver-tests metabase-enterprise.data-testing.action-runner-test
  "Runs of saved action tests."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.test :as mt])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- drivers
  "The test drivers that run tests and actions, and whose SQL a write can be checked in. H2 has no such dialect."
  []
  (disj (mt/normal-drivers-with-feature :transforms/testing :actions/custom) :h2))

(def ^:private slugged-parameters
  "The default query action's two parameters, with ids that differ from their slugs, `id` and `name`. `name` is hidden
  and defaults to `Hidden`."
  {:parameters             [{:id "p-id" :slug "id" :type "number" :target [:variable [:template-tag "id"]]}
                            {:id "p-name" :slug "name" :type "text" :required false
                             :target [:variable [:template-tag "name"]]}]
   :visualization_settings {:fields {"p-name" {:id "p-name" :hidden true :defaultValue "Hidden"}}}})

(defn- run-action-test!
  "Run a saved test of the action `action-id` with `parameters`, the categories input, and `expectations`."
  [action-id parameters expectations]
  (mt/with-temp [:model/ActionTest action-test {:action_id    action-id
                                                :parameters   parameters
                                                :inputs       [(data-testing.test-util/categories-input)]
                                                :expectations expectations}]
    (data-testing.runner/run-test! :action (data-testing.db/action action-id) action-test)))

(defn- refusal!
  "The `:error-type` of the refusal of a run of `action-id` with `parameters`, or nil when it runs."
  [action-id parameters]
  (try (run-action-test! action-id parameters [(data-testing.test-util/categories-named "Toy" "Food")])
       nil
       (catch ExceptionInfo e (:error-type (ex-data e)))))

(deftest query-action-runs-on-the-inputs-test
  (mt/test-drivers (drivers)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [_                   {:type :model :dataset_query (data-testing.test-util/categories-query)}
                        {:keys [action-id]} {}]
        (testing "the action's SQL, with the test's parameter values, changes the input's rows"
          ;; The default query action renames category `id` to `<name> Shop`.
          (is (=? {:status :passed :expectations [{:status :passed}]}
                  (run-action-test! action-id {"id" 1 "name" "Wood"} [(data-testing.test-util/categories-named "Wood Shop" "Food")]))))
        (testing "an expectation that reads the rows as they were before the action fails"
          (is (=? {:status :failed :expectations [{:status :failed}]}
                  (run-action-test! action-id {"id" 1 "name" "Wood"} [(data-testing.test-util/categories-named "Toy" "Food")]))))
        (testing "the real table is not written"
          (is (= [] (data-testing.test-util/renamed-categories "Wood Shop"))))))))

(deftest parameters-are-filled-as-a-run-of-the-action-fills-them-test
  (mt/test-drivers (drivers)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [_                   {:type :model :dataset_query (data-testing.test-util/categories-query)}
                        {:keys [action-id]} slugged-parameters]
        (testing "a value keyed by slug reaches the parameter, and the hidden parameter takes its default"
          (is (=? {:status :passed}
                  (run-action-test! action-id {"id" 2} [(data-testing.test-util/categories-named "Toy" "Hidden Shop")]))))
        (testing "a value for the hidden parameter is refused"
          (is (= ::data-testing.errors/invalid-parameters (refusal! action-id {"id" 2 "name" "Wood"}))))
        (testing "a value for no parameter is refused"
          (is (= ::data-testing.errors/invalid-parameters (refusal! action-id {"id" 2 "colour" "red"}))))
        (testing "a required parameter with no value is refused"
          (is (= ::data-testing.errors/uncompilable-subject (refusal! action-id {}))))))))

(deftest only-query-actions-on-databases-with-actions-enabled-are-tested-test
  (mt/test-drivers (drivers)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [_                     {:type :model :dataset_query (data-testing.test-util/categories-query)}
                        {query-action :action-id}    {}
                        {implicit-action :action-id} {:type :implicit :kind "row/update"}]
        (testing "control: the query action runs"
          (is (nil? (refusal! query-action {"id" 1 "name" "Wood"}))))
        (testing "an implicit action is refused"
          (is (= ::data-testing.errors/unsupported-action (refusal! implicit-action {"id" 1 "name" "Wood"}))))
        (testing "a query action on a database with actions turned off is refused"
          (mt/with-actions-disabled
            (is (= ::data-testing.errors/actions-disabled (refusal! query-action {"id" 1 "name" "Wood"})))))))))
