(ns metabase-enterprise.similarity.views.ensemble-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:sequential cold-ensemble-no-base-rows-test
  (testing "ensemble runs cleanly when there are no base rows for the typed pair"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (let [{:keys [status inserted]} (runner/run-view! :ensemble)]
        (is (= :ok status))
        (is (zero? inserted))))))
