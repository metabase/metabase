(ns metabase.query-processor.middleware.constraints-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.test :as mt]))

(defn- add-default-userland-constraints [query]
  (:pre (mt/test-qp-middleware constraints/add-default-userland-constraints query)))

;; don't do anything to queries without [:middleware :add-default-userland-constraints?] set
(expect
  {}
  (add-default-userland-constraints {}))

;; if it is *truthy* add the constraints
(expect
  {:middleware  {:add-default-userland-constraints? true},
   :constraints {:max-results           @#'constraints/max-results
                 :max-results-bare-rows @#'constraints/max-results-bare-rows}}
  (add-default-userland-constraints
   {:middleware {:add-default-userland-constraints? true}}))

;; don't do anything if it's not truthy
(expect
  {:middleware {:add-default-userland-constraints? false}}
  (add-default-userland-constraints
   {:middleware {:add-default-userland-constraints? false}}))

;; if it already has constraints, don't overwrite those!
(expect
  {:middleware  {:add-default-userland-constraints? true}
   :constraints {:max-results           @#'constraints/max-results
                 :max-results-bare-rows 1}}
  (add-default-userland-constraints
   {:constraints {:max-results-bare-rows 1}
    :middleware  {:add-default-userland-constraints? true}}))

;; if you specify just `:max-results` it should make sure `:max-results-bare-rows` is <= `:max-results`
(expect
  {:middleware  {:add-default-userland-constraints? true}
   :constraints {:max-results           5
                 :max-results-bare-rows 5}}
  (add-default-userland-constraints
   {:constraints {:max-results 5}
    :middleware  {:add-default-userland-constraints? true}}))

;; if you specify both it should still make sure `:max-results-bare-rows` is <= `:max-results`
(expect
  {:middleware  {:add-default-userland-constraints? true}
   :constraints {:max-results           5
                 :max-results-bare-rows 5}}
  (add-default-userland-constraints
   {:constraints {:max-results 5, :max-results-bare-rows 10}
    :middleware  {:add-default-userland-constraints? true}}))
