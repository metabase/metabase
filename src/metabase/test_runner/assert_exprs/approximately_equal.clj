(ns metabase.test-runner.assert-exprs.approximately-equal
  "See #23982 for explanation."
  (:require
   [methodical.core :as methodical]))

(methodical/defmulti ≈*
  {:arglists '([expected actual])}
  (fn [expected actual]
    [(type expected) (type actual)]))

(def ^:dynamic ^:private *impl*
  "Multifn that [[≈]] should use. Normally [[≈*]] but this will be rebound when using the 3-arity version of the test
  assertion. (Methodical allows you to create new multifns programatically and add new methods non-destructively.)"
  ≈*)

(defn- add-primary-methods
  "Add primary methods in map `m` of dispatch value -> method fn to [[*impl*]]. Return a new multifn with those methods
  added."
  [m]
  (reduce
   (fn [multifn [dispatch-value f]]
     (methodical/add-primary-method multifn dispatch-value f))
   *impl*
   m))

(def ^:dynamic *debug*
  "Whether to enable Methodical method tracing for debug purposes."
  false)

(defn ≈
  "Are `expected` and `actual` 'approximately' equal to one another?"
  ([expected actual]
   (≈ *impl* expected actual))

  ([≈-multifn expected actual]
   (let [≈-multifn (if (map? ≈-multifn)
                     (add-primary-methods ≈-multifn)
                     ≈-multifn)]
     (binding [*impl* ≈-multifn]
       (if *debug*
         (methodical/trace ≈-multifn expected actual)
         (≈-multifn expected actual))))))

;;;; Default method impls

(methodical/defmethod ≈* :default
  [expected actual]
  (when-not (= expected actual)
    (list 'not= expected actual)))

(methodical/defmethod ≈* [Class Object]
  [expected-class actual]
  (when-not (instance? expected-class actual)
    (list 'not (list 'instance? expected-class actual))))

(methodical/defmethod ≈* [java.util.regex.Pattern String]
  [expected-regex s]
  (when-not (re-find expected-regex s)
    (list 'not (list 're-find expected-regex s))))

;; two regexes should be treated as equal if they're the same pattern.
(methodical/defmethod ≈* [java.util.regex.Pattern java.util.regex.Pattern]
  [expected actual]
  (when-not (= (str expected) (str actual))
    (list 'not= (list 'str expected) (list 'str actual))))

(methodical/defmethod ≈* [clojure.lang.AFunction Object]
  [pred actual]
  (when-not (pred actual)
    (list 'not (list pred actual))))

(methodical/defmethod ≈* [clojure.lang.Sequential clojure.lang.Sequential]
  [expected-seq actual-seq]
  (loop [acc                        []
         [expected & more-expected] expected-seq
         [actual & more-actual]     actual-seq]
    (let [result (≈ expected actual)
          acc    (conj acc result)]
      (if (or (seq more-expected)
              (seq more-actual))
        (recur acc more-expected more-actual)
        (when (some some? acc)
          acc)))))

(methodical/defmethod ≈* [clojure.lang.IPersistentMap clojure.lang.IPersistentMap]
  [expected-map actual-map]
  (not-empty (into {} (for [[k expected] expected-map
                            :let         [actual       (get actual-map k (symbol "nil #_\"key is not present.\""))
                                          ≈-result (≈ expected actual)]
                            :when        ≈-result]
                        [k ≈-result]))))
