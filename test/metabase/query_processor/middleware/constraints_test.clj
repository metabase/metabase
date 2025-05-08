(ns metabase.query-processor.middleware.constraints-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.middleware.constraints :as qp.constraints]))

(deftest ^:parallel no-op-without-middleware-options-test
  (testing "don't do anything to queries without [:middleware :add-default-userland-constraints?] and :userland-query? set"
    (is (= {}
           (qp.constraints/maybe-add-default-userland-constraints {})))))

(deftest ^:parallel add-constraints-test
  (testing "if it is *truthy* add the constraints"
    (is (=? {:middleware  {:add-default-userland-constraints? true
                           :userland-query?                   true}
             :info        {:card-entity-id        lib.tu/placeholder-entity-id?}
             :constraints {:max-results           @#'qp.constraints/default-aggregated-query-row-limit
                           :max-results-bare-rows @#'qp.constraints/default-unaggregated-query-row-limit}}
            (qp.constraints/maybe-add-default-userland-constraints
             {:middleware {:add-default-userland-constraints? true
                           :userland-query?                   true}})))))

(deftest ^:parallel no-op-if-option-is-false-test
  (testing "don't do anything if it's not truthy"
    (is (= {:middleware {:add-default-userland-constraints? false}}
           (qp.constraints/maybe-add-default-userland-constraints
            {:middleware {:add-default-userland-constraints? false}})))))

(deftest ^:parallel dont-overwrite-existing-constraints-test
  (testing "if it already has constraints, don't overwrite those!"
    (is (= {:middleware  {:add-default-userland-constraints? true
                          :userland-query?                   true}
            :info        {:card-entity-id        "TY8R-MaO7V79FKecQyKww"}
            :constraints {:max-results           @#'qp.constraints/default-aggregated-query-row-limit
                          :max-results-bare-rows 1}}
           (qp.constraints/maybe-add-default-userland-constraints
            {:constraints {:max-results-bare-rows 1}
             :info        {:card-entity-id "TY8R-MaO7V79FKecQyKww"}
             :middleware  {:add-default-userland-constraints? true
                           :userland-query?                   true}})))))

(deftest ^:parallel max-results-bare-rows-should-be-less-than-max-results-test
  (testing "if you specify just `:max-results` it should make sure `:max-results-bare-rows` is <= `:max-results`"
    (is (= {:middleware  {:add-default-userland-constraints? true
                          :userland-query?                   true}
            :info        {:card-entity-id        "TY8R-MaO7V79FKecQyKww"}
            :constraints {:max-results           5
                          :max-results-bare-rows 5}}
           (qp.constraints/maybe-add-default-userland-constraints
            {:constraints {:max-results 5}
             :info        {:card-entity-id        "TY8R-MaO7V79FKecQyKww"}
             :middleware  {:add-default-userland-constraints? true
                           :userland-query?                   true}})))))

(deftest ^:parallel max-results-bare-rows-should-be-less-than-max-results-test-2
  (testing "if you specify both it should still make sure `:max-results-bare-rows` is <= `:max-results`"
    (is (= {:middleware  {:add-default-userland-constraints? true
                          :userland-query?                   true}
            :info        {:card-entity-id        "TY8R-MaO7V79FKecQyKww"}
            :constraints {:max-results           5
                          :max-results-bare-rows 5}}
           (qp.constraints/maybe-add-default-userland-constraints
            {:constraints {:max-results 5, :max-results-bare-rows 10}
             :info        {:card-entity-id        "TY8R-MaO7V79FKecQyKww"}
             :middleware  {:add-default-userland-constraints? true
                           :userland-query?                   true}})))))
