(ns metabase.query-processor.middleware.constraints-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.test :as mt]))

(defn- add-default-userland-constraints [query]
  (:pre (mt/test-qp-middleware constraints/add-default-userland-constraints query)))

(deftest test-default-constraints
  (testing "do nothing when :add-default-userland-constraints? is not set"
    ;; don't do anything to queries without [:middleware :add-default-userland-constraints?] set
    (is (= {}
           (add-default-userland-constraints {}))))

  (testing "defaults are added when :add-default-userland-constraints? set"
    ;; if it is *truthy* add the constraints
    (is (= {:middleware  {:add-default-userland-constraints? true}
            :constraints {:max-results           (constraints/max-results)
                          :max-results-bare-rows (constraints/max-results-bare-rows)}}
           (add-default-userland-constraints
            {:middleware {:add-default-userland-constraints? true}}))))

  (testing "defaults are not added when told not to"
    ;; don't do anything if it's not truthy
    (is (= {:middleware {:add-default-userland-constraints? false}}
           (add-default-userland-constraints
            {:middleware {:add-default-userland-constraints? false}}))))

  (testing "do not overwrite provided constraints"
    ;; if it already has constraints, don't overwrite those!
    (is (= {:middleware  {:add-default-userland-constraints? true}
            :constraints {:max-results           (constraints/max-results)
                          :max-results-bare-rows 1}}
           (add-default-userland-constraints
            {:constraints {:max-results-bare-rows 1}
             :middleware  {:add-default-userland-constraints? true}}))))

  (testing "make sure :max-results-bare-rows <= :max-results"
    (testing "just :max-results specified"
      ;; if you specify just `:max-results` it should make sure `:max-results-bare-rows` is <= `:max-results`
      (is (= {:middleware  {:add-default-userland-constraints? true}
              :constraints {:max-results           5
                            :max-results-bare-rows 5}}

             (add-default-userland-constraints
              {:constraints {:max-results 5}
               :middleware  {:add-default-userland-constraints? true}}))))

    (testing "specify both"
      ;; if you specify both it should still make sure `:max-results-bare-rows` is <= `:max-results`
      (is (= {:middleware  {:add-default-userland-constraints? true}
              :constraints {:max-results           5
                            :max-results-bare-rows 5}}
             (add-default-userland-constraints
              {:constraints {:max-results           5
                             :max-results-bare-rows 10}
               :middleware  {:add-default-userland-constraints? true}}))))))
