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

(def ^:private not-listed-types
  "The entity types whose models declare no `:items`, so that no list holds them."
  #{})

(deftest ^:parallel every-entity-type-is-listed-test
  (testing "every model with a `:type` declares `:items`, or is explicitly not listed"
    (doseq [[entity-type model] (dependencies/type->model)
            :when (not (contains? not-listed-types entity-type))]
      (testing model
        (is (some? (:items (dependencies/spec model))))))))

(deftest ^:parallel part-columns-come-with-part-of-test
  (testing "a spec declares `:part-columns` exactly when it declares `:part-of`"
    (dependencies/type->model)
    (doseq [model (keys (dissoc (methods dependencies/spec) :default))
            :let  [spec (dependencies/spec model)]]
      (testing model
        (is (= (contains? spec :part-of) (contains? spec :part-columns)))))))

(deftest ^:parallel no-empty-spec-test
  (testing "no model declares an empty spec only to have its writes read"
    (dependencies/type->model)
    (doseq [model (keys (dissoc (methods dependencies/spec) :default))]
      (testing model
        (is (seq (dependencies/spec model)))))))
