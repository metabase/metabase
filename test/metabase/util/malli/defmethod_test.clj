(ns metabase.util.malli.defmethod-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli.defmethod :as mu.defmethod]))

(deftest ^:parallel instrumented-fn-form-test
  (are [form expected] (= expected
                          (mu.defmethod/instrumented-fn-form form))
    '([x :- :int y])
    '(malli.core/-instrument
      {:schema [:=> [:cat :int :any] :any]}
      (clojure.core/fn [x y]))

    '(:- :int [x :- :int y])
    '(malli.core/-instrument
      {:schema [:=> [:cat :int :any] :int]}
      (clojure.core/fn [x y]))

    '(:- :int [x :- :int y] (+ x y))
    '(malli.core/-instrument
      {:schema [:=> [:cat :int :any] :int]}
      (clojure.core/fn [x y]
        (+ x y)))

    '([x :- :int y] {:pre [(int? x)]})
    '(malli.core/-instrument
      {:schema [:=> [:cat :int :any] :any]}
      (clojure.core/fn [x y] {:pre [(int? x)]}))

    '(:- :int
         ([x] (inc x))
         ([x :- :int y] (+ x y)))
    '(malli.core/-instrument
      {:schema [:function
                [:=> [:cat :any] :int]
                [:=> [:cat :int :any] :int]]}
      (clojure.core/fn
        ([x] (inc x))
        ([x y] (+ x y))))))
