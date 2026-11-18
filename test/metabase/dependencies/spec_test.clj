(ns metabase.dependencies.spec-test
  (:require
   [clojure.test :refer :all]
   [metabase.dependencies.core :as dependencies]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel every-spec-is-valid-test
  (dependencies/type->model)
  (doseq [model (keys (dissoc (methods dependencies/spec) :default))]
    (testing model
      (is (nil? (mr/explain dependencies/Spec (dependencies/spec model)))))))

(deftest ^:parallel computed-entities-are-entities-test
  (testing "a spec that computes dependencies declares the entity type it stores them under"
    (doseq [model (keys (dissoc (methods dependencies/spec) :default))
            :let  [spec (dependencies/spec model)]
            :when (or (:dependencies spec) (:inlined? spec) (:after-dependencies spec))]
      (testing model
        (is (keyword? (:type spec)))))))
