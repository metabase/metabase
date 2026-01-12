(ns metabase.query-processor.store-test
  ;; The parent namespace is in the process of deprecation so ignore deprecated vars in this namespace.
  {:clj-kondo/config '{:linters {:deprecated-var {:level :off}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
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

(deftest ^:parallel reuse-existing-store-fail-if-changing-db-test
  (testing "Throw an exception if you try to change the store after one is already bound"
    (let [mp-1 (lib.tu/mock-metadata-provider
                {:database (assoc meta/database :id 2)})
          mp-2 (lib.tu/mock-metadata-provider
                {:database (assoc meta/database :id 3)})]
      (qp.store/with-metadata-provider mp-1
        (testing "Rebinding another MetadataProvider(able)"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"\QCannot replace MetadataProvider with another one after it has been bound\E"
               (qp.store/with-metadata-provider mp-2
                 nil))))
        (testing "Rebinding another Database ID"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"\QAttempting to initialize metadata provider with new Database 3. Queries can only reference one Database. Already referencing: 2\E"
               (qp.store/with-metadata-provider 3
                 nil))))))))

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
