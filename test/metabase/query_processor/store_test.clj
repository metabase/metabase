(ns metabase.query-processor.store-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.store :as qp.store]))

;; make sure `cached` only evaluates its body once during the duration of a QP run
(expect
  {:value :ok, :eval-count 1}
  (let [eval-count   (atom 0)
        cached-value (fn []
                       (qp.store/cached :value
                        (swap! eval-count inc)
                        :ok))]
    (qp.store/with-store
      (cached-value)
      (cached-value)
      {:value      (cached-value)
       :eval-count @eval-count})))

;; multiple calls to `with-store` should keep the existing store if one is already established
(expect
  {:value :ok, :eval-count 1}
  (let [eval-count   (atom 0)
        cached-value (fn []
                       (qp.store/cached :value
                        (swap! eval-count inc)
                        :ok))]
    (qp.store/with-store
      (cached-value)
      (qp.store/with-store
        (cached-value)
        (qp.store/with-store
          {:value      (cached-value)
           :eval-count @eval-count})))))

;; caching should be unique for each key
(expect
  {:a :a, :b :b, :eval-count 2}
  (let [eval-count   (atom 0)
        cached-value (fn [x]
                       (qp.store/cached x
                         (swap! eval-count inc)
                         x))]
    (qp.store/with-store
      (cached-value :a)
      (cached-value :b)
      {:a          (cached-value :a)
       :b          (cached-value :b)
       :eval-count @eval-count})))
