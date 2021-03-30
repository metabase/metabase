(ns metabase.query-processor.middleware.constraints-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.test :as mt]))

(defn- add-default-userland-constraints [query]
  (:pre (mt/test-qp-middleware constraints/add-default-userland-constraints query)))

(deftest no-op-without-middleware-options-test
  (testing "don't do anything to queries without [:middleware :add-default-userland-constraints?] set"
    (is (= {}
           (add-default-userland-constraints {})))))

(deftest add-constraints-test
  (testing "if it is *truthy* add the constraints"
    (is (= {:middleware  {:add-default-userland-constraints? true},
            :constraints {:max-results           @#'constraints/max-results
                          :max-results-bare-rows @#'constraints/max-results-bare-rows}}
           (add-default-userland-constraints
            {:middleware {:add-default-userland-constraints? true}})))))

(deftest no-op-if-option-is-false-test
  (testing "don't do anything if it's not truthy"
    (is (= {:middleware {:add-default-userland-constraints? false}}
           (add-default-userland-constraints
            {:middleware {:add-default-userland-constraints? false}})))))

(deftest dont-overwrite-existing-constraints-test
  (testing "if it already has constraints, don't overwrite those!"
    (is (= {:middleware  {:add-default-userland-constraints? true}
            :constraints {:max-results           @#'constraints/max-results
                          :max-results-bare-rows 1}}
           (add-default-userland-constraints
            {:constraints {:max-results-bare-rows 1}
             :middleware  {:add-default-userland-constraints? true}})))))

(deftest max-results-bare-rows-should-be-less-than-max-results-test
  (testing "if you specify just `:max-results` it should make sure `:max-results-bare-rows` is <= `:max-results`"
    (is (= {:middleware  {:add-default-userland-constraints? true}
            :constraints {:max-results           5
                          :max-results-bare-rows 5}}
           (add-default-userland-constraints
            {:constraints {:max-results 5}
             :middleware  {:add-default-userland-constraints? true}}))))

  (testing "if you specify both it should still make sure `:max-results-bare-rows` is <= `:max-results`"
    (is (= {:middleware  {:add-default-userland-constraints? true}
            :constraints {:max-results           5
                          :max-results-bare-rows 5}}
           (add-default-userland-constraints
            {:constraints {:max-results 5, :max-results-bare-rows 10}
             :middleware  {:add-default-userland-constraints? true}})))))
