(ns metabase-enterprise.dependencies.dependency-types-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase.dependencies.core :as dependencies]))

(deftest ^:parallel dependency-types-are-spec-types-test
  (testing "the entity types the API takes are those the dependencies specs declare"
    (is (= deps.dependency-types/dependency-types (dependencies/entity-types)))))
