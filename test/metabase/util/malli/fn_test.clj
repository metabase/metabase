(ns ^:mb/once metabase.util.malli.fn-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.util.malli :as mu]
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
    '[{:keys [x]} :- [:maybe :map]]

    '[{:keys [x]} y]
    '[{:keys [x]} :- [:maybe :map] y]

    '[{:keys [x]} :- [:map [:x :int]]]
    '[{:keys [x]} :- [:map [:x :int]]]

    '[{:keys [x]} :- [:map [:x :int]] {:keys [y]}]
    '[{:keys [x]} :- [:map [:x :int]] {:keys [y]} :- [:maybe :map]]

    ;; key-value varargs: add [:* :any]
    '[path opts :- :map & {:keys [token-check?], :or {token-check? true}}]
    '[path opts :- :map & {:keys [token-check?], :or {token-check? true}} :- [:* :any]]))

(deftest ^:parallel fn-schema-test
  (is (= [:function
          [:=> :cat :string]
          [:=> [:cat :any] :string]
          [:=> [:cat :int [:maybe :keyword]] :string]]
         (mu.fn/fn-schema
          (mu.fn/parse-fn-tail
           '(describe-temporal-unit :- :string
                                    ([]
                                     (describe-temporal-unit 1 nil))

                                    ([unit]
                                     (describe-temporal-unit 1 unit))

                                    ([n    :- :int
                                      unit :- [:maybe :keyword]]
                                     (str n \space (or unit :day)))))))))

(deftest ^:parallel instrumented-fn-form-test
  (are [form expected] (= expected
                          (walk/macroexpand-all (mu.fn/instrumented-fn-form (mu.fn/parse-fn-tail form))))
    '([x :- :int y])
    '(let* [&f (fn* ([x y]))]
       (fn* ([a b]
             (metabase.util.malli.fn/validate-input :int a)
             (&f a b))))

    '(:- :int [x :- :int y])
    '(let* [&f (fn* ([x y]))]
       (fn* ([a b]
             (metabase.util.malli.fn/validate-input :int a)
             (metabase.util.malli.fn/validate-output :int (&f a b)))))

    '(:- :int [x :- :int y] (+ x y))
    '(let* [&f (fn* ([x y] (+ x y)))]
       (fn* ([a b]
             (metabase.util.malli.fn/validate-input :int a)
             (metabase.util.malli.fn/validate-output :int (&f a b)))))

    '([x :- :int y] {:pre [(int? x)]})
    '(let* [&f (fn* ([x y]
                     {:pre [(int? x)]}))]
       (fn* ([a b]
             (metabase.util.malli.fn/validate-input :int a)
             (&f a b))))

    '(:- :int
         ([x] (inc x))
         ([x :- :int y] (+ x y)))
    '(let* [&f (fn* ([x]
                     (inc x))
                    ([x y]
                     (+ x y)))]
       (fn*
        ([a]
         (metabase.util.malli.fn/validate-output :int (&f a)))
        ([a b]
         (metabase.util.malli.fn/validate-input :int a)
         (metabase.util.malli.fn/validate-output :int (&f a b)))))))

(deftest ^:parallel fn-test
  (let [f (mu.fn/fn :- :int [y] y)]
    (is (= 1
           (f 1)))
    (mu/disable-enforcement
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

(deftest ^:parallel varargs-test
  (let [form '(metabase.util.malli.fn/fn v2-load-internal!
                [path
                 opts :- :map
                 & {:keys [token-check?]
                    :or   {token-check? true}}]
                (merge {:path path, :token-check? token-check?} opts))]
    (is (= '(let* [&f (clojure.core/fn
                        [path opts & {:keys [token-check?], :or {token-check? true}}]
                        (merge {:path path, :token-check? token-check?} opts))]
              (clojure.core/fn
                ([a b & more]
                 (metabase.util.malli.fn/validate-input :map b)
                 (clojure.core/apply &f a b more))))
           (macroexpand form)))
    (is (= [:=>
            [:cat :any :map [:* :any]]
            :any]
           (mu.fn/fn-schema (mu.fn/parse-fn-tail (rest form))))))
  (let [f (mu.fn/fn v2-load-internal!
            [path
             opts :- :map
             & {:keys [token-check?]
                :or   {token-check? true}}]
            (merge {:path path, :token-check? token-check?} opts))]
    (is (= {:path "path", :token-check? true, :opts true}
           (f "path" {:opts true})))
    (is (= {:path "path", :token-check? false, :opts true}
           (f "path" {:opts true} :token-check? false)))))
