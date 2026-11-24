(ns metabase.xrays.spec-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.malli.registry :as mr]
   [metabase.xrays.related]
   [metabase.xrays.spec :as xrays.spec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private spec-models
  "The models that give an x-rays spec."
  #{:model/Card :model/Dashboard :model/Field :model/Query :model/Segment :model/Table :xrays/Metric})

(deftest spec-models-test
  (testing "every model that gives an x-rays spec is expected, and the other way round"
    (run! t2/resolve-model (remove #{:xrays/Metric} spec-models))
    (is (= spec-models (xrays.spec/models)))))

(deftest spec-schema-test
  (doseq [model (xrays.spec/models)]
    (testing model
      (is (nil? (mr/explain xrays.spec/Spec (xrays.spec/spec model)))))))
