(ns metabase-enterprise.data-testing.test-type-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [malli.core :as mc]
   [metabase-enterprise.data-testing.models]
   [metabase-enterprise.data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.segment-test]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest every-test-type-has-a-spec-test
  (doseq [test-type (mc/children (mr/resolve-schema ::data-testing.schema/test-type))
          :let [{:keys [model run-topics subject]} (data-testing.test-type/spec test-type)]]
    (testing test-type
      (testing "names a model whose table exists"
        (is (keyword? model))
        (is (int? (t2/count model))))
      (testing "names a start and a timeout topic"
        (is (= #{:start :timeout} (set (keys run-topics))))
        (is (every? qualified-keyword? (vals run-topics))))
      (testing "names how to load a test's subject, and its model answers whether the current user may run a test"
        (is (ifn? subject))
        (is (some? (methodical/primary-method t2/batched-hydrate [model :can_query])))))))

(deftest unknown-test-type-has-no-spec-test
  (is (nil? (data-testing.test-type/spec :no-such-test-type))))
