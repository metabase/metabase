(ns metabase.staleness.spec-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.staleness.core :as staleness]
   [metabase.staleness.spec :as staleness.spec]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private spec-models
  "The models that give a staleness spec."
  #{:model/Card :model/Dashboard :model/Document :model/Transform})

(deftest spec-models-test
  (testing "every model that gives a staleness spec is expected, and the other way round"
    (run! t2/resolve-model spec-models)
    (is (= spec-models (staleness/models)))))

(deftest spec-schema-test
  (doseq [model (staleness/models)]
    (testing model
      (is (nil? (mr/explain staleness.spec/Spec (staleness/spec model)))))))

(deftest rendered-models-test
  (testing "the stale content page lists the models with a loader and a renderer"
    (run! t2/resolve-model spec-models)
    (is (= #{:model/Card :model/Dashboard} (staleness/rendered-models)))))

(deftest candidates-columns-test
  (doseq [model (staleness/models)]
    (testing model
      (let [query ((staleness/candidates-fn model) {:collection-ids :all
                                                    :cutoff-date    (java.time.LocalDate/now)})]
        (is (mr/validate ::staleness/query query))
        (is (= [:id :model :name :last_used_at :collection_id]
               (map #(if (vector? %) (last %) (keyword (last (str/split (name %) #"\.")))) (:select query))))
        (is (sequential? (t2/query query)))))))
