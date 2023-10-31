(ns metabase.query-processor.middleware.constraints-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.middleware.constraints :as qp.constraints]))

(defn- add-default-userland-constraints [query]
  (#'qp.constraints/add-default-userland-constraints query))

(deftest ^:parallel no-op-without-middleware-options-test
  (testing "don't do anything to queries without middleware options set"
    (are [query] (= query
                    (add-default-userland-constraints query))
      {}
      {:middleware {:userland-query? true}}
      {:middleware {:add-default-userland-constraints? true}})))

(deftest ^:parallel add-constraints-test
  (testing "if it is *truthy* add the constraints"
    (is (= {:middleware  {:userland-query?                   true
                          :add-default-userland-constraints? true}
            :constraints {:max-results           @#'qp.constraints/max-results
                          :max-results-bare-rows @#'qp.constraints/default-max-results-bare-rows}}
           (add-default-userland-constraints
            {:middleware {:userland-query?                   true
                          :add-default-userland-constraints? true}})))))

(deftest ^:parallel no-op-if-option-is-false-test
  (testing "don't do anything if it's not truthy"
    (is (= {:middleware {:userland-query?                   true
                         :add-default-userland-constraints? false}}
           (add-default-userland-constraints
            {:middleware {:userland-query?                   true
                          :add-default-userland-constraints? false}})))))

(deftest ^:parallel dont-overwrite-existing-constraints-test
  (testing "if it already has constraints, don't overwrite those!"
    (is (= {:middleware  {:userland-query?                   true
                          :add-default-userland-constraints? true}
            :constraints {:max-results           @#'qp.constraints/max-results
                          :max-results-bare-rows 1}}
           (add-default-userland-constraints
            {:constraints {:max-results-bare-rows 1}
             :middleware  {:userland-query?                   true
                           :add-default-userland-constraints? true}})))))

(deftest ^:parallel max-results-bare-rows-should-be-less-than-max-results-test
  (testing "if you specify just `:max-results` it should make sure `:max-results-bare-rows` is <= `:max-results`"
    (is (= {:middleware  {:userland-query?                   true
                          :add-default-userland-constraints? true}
            :constraints {:max-results           5
                          :max-results-bare-rows 5}}
           (add-default-userland-constraints
            {:constraints {:max-results 5}
             :middleware  {:userland-query?                   true
                           :add-default-userland-constraints? true}})))))

(deftest ^:parallel max-results-bare-rows-should-be-less-than-max-results-test-2
  (testing "if you specify both it should still make sure `:max-results-bare-rows` is <= `:max-results`"
    (is (= {:middleware  {:userland-query?                   true
                          :add-default-userland-constraints? true}
            :constraints {:max-results           5
                          :max-results-bare-rows 5}}
           (add-default-userland-constraints
            {:constraints {:max-results 5, :max-results-bare-rows 10}
             :middleware  {:userland-query?                   true
                           :add-default-userland-constraints? true}})))))
