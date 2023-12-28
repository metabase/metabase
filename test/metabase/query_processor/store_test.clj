(ns metabase.query-processor.store-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]))

(deftest ^:parallel cached-test
  (testing "make sure `cached` only evaluates its body once during the duration of a QP run"
    (let [eval-count   (atom 0)
          cached-value (fn []
                         (qp.store/cached :value
                                          (swap! eval-count inc)
                                          :ok))]
      (qp.store/with-metadata-provider meta/metadata-provider
        (cached-value)
        (cached-value)
        (is (= {:value :ok, :eval-count 1}
               {:value      (cached-value)
                :eval-count @eval-count}))))))

(deftest ^:parallel reuse-existing-store-test
  (testing "multiple calls to `with-store` should keep the existing store if one is already established"
    (let [eval-count   (atom 0)
          cached-value (fn []
                         (qp.store/cached :value
                                          (swap! eval-count inc)
                                          :ok))]
      (qp.store/with-metadata-provider meta/metadata-provider
        (cached-value)
        (qp.store/with-metadata-provider meta/metadata-provider
          (cached-value)
          (is (= {:value :ok, :eval-count 1}
                 (qp.store/with-metadata-provider (u/the-id (lib.metadata.protocols/database meta/metadata-provider))
                   {:value      (cached-value)
                    :eval-count @eval-count}))))))))

(deftest ^:parallel caching-unique-key-test
  (testing "caching should be unique for each key"
    (let [eval-count   (atom 0)
          cached-value (fn [x]
                         (qp.store/cached x
                                          (swap! eval-count inc)
                                          x))]
      (qp.store/with-metadata-provider meta/metadata-provider
        (cached-value :a)
        (cached-value :b)
        (is (= {:a :a, :b :b, :eval-count 2}
               {:a          (cached-value :a)
                :b          (cached-value :b)
                :eval-count @eval-count}))))))
