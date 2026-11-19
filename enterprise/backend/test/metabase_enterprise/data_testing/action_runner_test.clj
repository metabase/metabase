(ns ^:mb/driver-tests metabase-enterprise.data-testing.action-runner-test
  "Runs of saved action tests."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]))

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
  (:error-type (data-testing.test-util/refusal
                #(run-action-test! action-id parameters [(data-testing.test-util/categories-named "Toy" "Food")]))))

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

(defn- categories-input-with
  "The categories input with only the columns named `column-names`, its format a keyword as a decoded test has it."
  [& column-names]
  (let [input   (data-testing.test-util/categories-input)
        keep?   (set column-names)]
    (-> input
        (assoc :format :rows)
        (update :columns #(filterv (comp keep? :name) %))
        (update :rows #(mapv (fn [row] (select-keys row column-names)) %)))))

(defn- validation-refusal
  "The refusal of a test of `subject`, a `subject-type`, with `input` and a passing expectation, or nil. The test is
  given as a decoded test has it, with keywords for its formats and types."
  [subject-type subject input parameters]
  (data-testing.test-util/refusal
   #(data-testing.runner/validate-test subject-type subject
                                       (cond-> {:inputs       [input]
                                                :expectations [(update (data-testing.test-util/categories-named "Toy" "Food")
                                                                       :type keyword)]}
                                         parameters (assoc :parameters parameters)))
   :columns))

(deftest write-columns-are-not-checked-against-inputs-test
  (testing "premise: the SQL parser reports a syntax error for a write, so the input-column check finds no columns that the write reads"
    (doseq [sql ["UPDATE categories SET name = 'x' WHERE id = 1"
                 "INSERT INTO categories (id, name) VALUES (1, 'x')"
                 "DELETE FROM categories WHERE id = 1"]]
      (is (= {:used-fields #{} :returned-fields [] :errors #{{:type :syntax-error}}}
             (sql-tools/field-references :postgres sql))
          sql)))
  (mt/test-drivers (drivers)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{model-id :id}      {:type :model :dataset_query (data-testing.test-util/categories-query)}
                        {:keys [action-id]} {}]
        (let [action     (data-testing.db/action action-id)
              parameters {"id" 1 "name" "Wood"}]
          (testing "control: a card test of the same table refuses an input that lacks a column the card reads"
            (is (=? {:error-type ::data-testing.errors/missing-input-columns
                     :columns    {(data-testing.test-util/qualified :categories) ["name"]}}
                    (validation-refusal :card (data-testing.db/card model-id) (categories-input-with "id") nil))))
          (testing "an action test whose input declares every column the write uses is accepted"
            (is (nil? (validation-refusal :action action (categories-input-with "id" "name") parameters))))
          ;; The default query action is `UPDATE categories SET name = ... WHERE id = {{id}}`.
          (doseq [[what present] [["the column it sets" "id"]
                                  ["the column its WHERE clause reads" "name"]]]
            (testing (str "an action test whose input lacks " what " is not refused when it is saved")
              (is (nil? (validation-refusal :action action (categories-input-with present) parameters))))
            (testing (str "an action test whose input lacks " what " is refused when it runs: the write fails on the temp table")
              (is (=? {:error-type ::data-testing.errors/query-failed}
                      (data-testing.test-util/refusal
                       #(mt/with-temp [:model/ActionTest action-test {:action_id    action-id
                                                                      :parameters   parameters
                                                                      :inputs       [(categories-input-with present)]
                                                                      :expectations [(data-testing.test-util/categories-named "Toy" "Food")]}]
                          (data-testing.runner/run-test! :action action action-test))))))))))))
