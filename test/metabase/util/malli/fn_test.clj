(ns metabase.util.malli.fn-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli.fn :as mu.fn]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel add-default-map-schemas-test
  (are [input expected] (= expected
                           (#'mu.fn/add-default-map-schemas input))
    []
    []

    '[x]
    '[x]

    '[x :- :int]
    '[x :- :int]

    '[x :- :int y]
    '[x :- :int y]

    '[{:keys [x]}]
    '[{:keys [x]} :- :any]

    '[{:keys [x]} y]
    '[{:keys [x]} :- :any y]

    '[{:keys [x]} :- [:map [:x :int]]]
    '[{:keys [x]} :- [:map [:x :int]]]

    '[{:keys [x]} :- [:map [:x :int]] {:keys [y]}]
    '[{:keys [x]} :- [:map [:x :int]] {:keys [y]} :- :any]))

(deftest ^:parallel parameterized-fn-tail->schema-test
  (is (= [:function
          [:=> :cat :string]
          [:=> [:cat :any] :string]
          [:=> [:cat :int [:maybe :keyword]] :string]]
         (#'mu.fn/parameterized-fn-tail->schema
          '(describe-temporal-unit :- :string
                                   ([]
                                    (describe-temporal-unit 1 nil))

                                   ([unit]
                                    (describe-temporal-unit 1 unit))

                                   ([n    :- :int
                                     unit :- [:maybe :keyword]]
                                    (str n \space (or unit :day))))))))

(deftest ^:parallel instrumented-fn-form-test
  ;; NOCOMMIT
  #_(are [form expected] (= expected
                          (mu.fn/instrumented-fn-form form))
    '([x :- :int y])
    '(malli.core/-instrument
      {:schema [:=> [:cat :int :any] :any], :report metabase.util.malli.fn/report}
      (clojure.core/fn [x y]))

    '(:- :int [x :- :int y])
    '(malli.core/-instrument
      {:schema [:=> [:cat :int :any] :int], :report metabase.util.malli.fn/report}
      (clojure.core/fn [x y]))

    '(:- :int [x :- :int y] (+ x y))
    '(malli.core/-instrument
      {:schema [:=> [:cat :int :any] :int], :report metabase.util.malli.fn/report}
      (clojure.core/fn [x y]
        (+ x y)))

    '([x :- :int y] {:pre [(int? x)]})
    '(malli.core/-instrument
      {:schema [:=> [:cat :int :any] :any], :report metabase.util.malli.fn/report}
      (clojure.core/fn [x y] {:pre [(int? x)]}))

    '(:- :int
         ([x] (inc x))
         ([x :- :int y] (+ x y)))
    '(malli.core/-instrument
      {:schema [:function
                [:=> [:cat :any] :int]
                [:=> [:cat :int :any] :int]]
       :report metabase.util.malli.fn/report}
      (clojure.core/fn
        ([x] (inc x))
        ([x y] (+ x y))))))

(deftest ^:parallel fn-test
  (let [f (mu.fn/fn :- :int [y] y)]
    (is (= 1
           (f 1)))
    (binding [mu.fn/*enforce* false]
      (is (nil? (f nil))))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid output:.*should be an integer"
         (f nil)))))

(deftest ^:parallel registry-test
  (mr/def ::number :int)
  (let [f (mu.fn/fn :- ::number [y] y)]
    (is (= 1
           (f 1)))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid output:.*should be an integer"
         (f 1.0)))
    (mr/def ::number double?)
    (is (= 1.0
           (f 1.0)))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid output:.*should be a double"
         (f 1)))))

;; FIXME
#_(deftest ^:parallel wtf-test
  (let [f (mu.fn/fn describe-temporal-unit :- :string
            ([]
             (describe-temporal-unit 1 nil))

            ([unit]
             (describe-temporal-unit 1 unit))

            ([n    :- :int
              unit :- [:maybe :keyword]]
             (str n \space (or unit :day))))]
    (is (= "1 :day"
           (f)))
    ;; TODO FIXME
    (is (= :wow
           (f "ok")))))
