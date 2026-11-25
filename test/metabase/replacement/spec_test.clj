(ns metabase.replacement.spec-test
  (:require
   [clojure.test :refer :all]
   [metabase.dependencies.core :as dependencies]
   [metabase.replacement.spec :as replacement.spec]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- spec-models
  "The models that have a replacement spec, after the registry of the dependencies specs loads every model namespace."
  []
  (dependencies/type->model)
  (set (keys (dissoc (methods replacement.spec/spec) :default))))

(deftest ^:parallel every-spec-is-valid-test
  (doseq [model (spec-models)]
    (testing model
      (is (nil? (mr/explain replacement.spec/Spec (replacement.spec/spec model)))))))

(deftest ^:parallel spec-models-test
  (is (= #{:model/Card :model/Dashboard :model/Measure :model/Segment :model/Table :model/Transform}
         (spec-models))))

(deftest ^:parallel sources-test
  (testing "cards and tables are sources, read from their database id column"
    (is (= 7 ((:source-database-id (replacement.spec/spec :model/Card)) {:database_id 7})))
    (is (= 7 ((:source-database-id (replacement.spec/spec :model/Table)) {:db_id 7}))))
  (testing "no other model is a source"
    (is (= #{:model/Card :model/Table}
           (into #{} (filter (comp :source-database-id replacement.spec/spec)) (spec-models))))))
