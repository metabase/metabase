(ns metabase.query-processor.store-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel cached-test
  (testing "make sure `cached` only evaluates its body once during the duration of a QP run"
    (let [eval-count   (atom 0)
          cached-value (fn []
                         (qp.store/cached :value
                                          (swap! eval-count inc)
                                          :ok))]
      (qp.store/with-store
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
      (qp.store/with-store
        (cached-value)
        (qp.store/with-store
          (cached-value)
          (is (= {:value :ok, :eval-count 1}
                 (qp.store/with-store
                   {:value      (cached-value)
                    :eval-count @eval-count}))))))))

(deftest ^:parallel caching-unique-key-test
  (testing "caching should be unique for each key"
    (let [eval-count   (atom 0)
          cached-value (fn [x]
                         (qp.store/cached x
                                          (swap! eval-count inc)
                                          x))]
      (qp.store/with-store
        (cached-value :a)
        (cached-value :b)
        (is (= {:a :a, :b :b, :eval-count 2}
               {:a          (cached-value :a)
                :b          (cached-value :b)
                :eval-count @eval-count}))))))

(deftest bootstrap-metadata-provider-test
  (let [venues-price-id (mt/id :venues :price)
        db              (mt/db)]
    (t2.with-temp/with-temp [:model/Card {card-id :id} {}]
      (qp.store/with-store
        (t2/with-call-count [call-count]
          (testing "return the bootstrap app DB metadata provider before DB is saved"
            (is (identical? (qp.store/bootstrap-application-database-metadata-provider)
                            (qp.store/metadata-provider))))
          (is (zero? (call-count)))
          (is (some? (lib.metadata/field (qp.store/metadata-provider) venues-price-id)))
          (is (= 1
                 (call-count)))
          (is (some? (lib.metadata/card (qp.store/metadata-provider) card-id)))
          (is (= 2
                 (call-count)))
          (testing "should cache fetched stuff"
            (is (some? (lib.metadata/field (qp.store/metadata-provider) venues-price-id)))
            (is (= 2
                   (call-count))))
          (qp.store/store-database! db)
          (is (= 2
                 (call-count)))
          (is (not= (qp.store/bootstrap-application-database-metadata-provider)
                    (qp.store/metadata-provider)))
          (testing "cache calls to metadata-provider"
            (is (identical? (qp.store/metadata-provider)
                            (qp.store/metadata-provider))))
          (testing "should use stuff cached by the bootstrap app DB metadata provider."
            (is (some? (lib.metadata/card (qp.store/metadata-provider) card-id)))
            (is (= 2
                   (call-count)))))))))
