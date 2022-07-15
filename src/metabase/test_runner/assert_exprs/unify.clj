(ns metabase.test-runner.assert-exprs.unify
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [methodical.core :as methodical]))

(methodical/defmulti unify*
  {:arglists '([expected actual])}
  (fn [expected actual]
    [(type expected) (type actual)]))

(def ^:dynamic ^:private *recursion-level* 0)

(def ^:dynamic *debug* true)

(def ^:dynamic *unify*
  unify*)

(methodical/defmethod unify* :around :default
  [expected actual]
  (if-not *debug*
    (next-method expected actual)
    (let [space                  (str/join (repeat (* *recursion-level* 2) \space))
          =>                     (str space '=> \space)
          dispatch-val           [(type expected) (type actual)]
          effective-dispatch-val (methodical/effective-dispatch-value *unify* dispatch-val)]
      (println (str space "   " (u/colorize :yellow (pr-str (list 'unify expected actual)))
                    \newline => (pr-str (cons 'unify dispatch-val))
                    \newline => (pr-str (if (= effective-dispatch-val :default)
                                          (list 'unify :default)
                                          (cons 'unify effective-dispatch-val)))))
      (let [result (binding [*recursion-level* (inc *recursion-level*)]
                     (next-method expected actual))]
        (println => (u/colorize (if (nil? result) :green :red)
                                (pr-str result)))
        result))))

(defn- multifn-by-adding-primary-methods [m]
  (reduce
   (fn [multifn [dispatch-value f]]
     (methodical/add-primary-method multifn dispatch-value f))
   *unify*
   m))

(defn unify
  ([expected actual]
   (*unify* expected actual))
  ([unify-multifn expected actual]
   (let [unify-multifn (if (map? unify-multifn)
                         (multifn-by-adding-primary-methods unify-multifn)
                         unify-multifn)]
     (binding [*unify* unify-multifn]
       (unify-multifn expected actual)))))

(methodical/defmethod unify* :default
  [expected actual]
  (when-not (= expected actual)
    (list 'not= expected actual)))

(methodical/defmethod unify* [Class Object]
  [expected-class actual]
  (when-not (instance? expected-class actual)
    (list 'not (list 'instance? expected-class actual))))

(methodical/defmethod unify* [java.util.regex.Pattern String]
  [expected-regex s]
  (when-not (re-find expected-regex s)
    (list 'not (list 're-find expected-regex s))))

;; two regexes should be treated as equal if they're the same pattern.
(methodical/defmethod unify* [java.util.regex.Pattern java.util.regex.Pattern]
  [expected actual]
  (when-not (= (str expected) (str actual))
    (list 'not= (list 'str expected) (list 'str actual))))

(methodical/defmethod unify* [clojure.lang.AFunction Object]
  [pred actual]
  (when-not (pred actual)
    (list 'not (list pred actual))))

(methodical/defmethod unify* [clojure.lang.Sequential clojure.lang.Sequential]
  [expected-seq actual-seq]
  (loop [acc                        []
         [expected & more-expected] expected-seq
         [actual & more-actual]     actual-seq]
    (let [result (unify expected actual)
          acc    (conj acc result)]
      (if (or (seq more-expected)
              (seq more-actual))
        (recur acc more-expected more-actual)
        (when (some some? acc)
          acc)))))

(methodical/defmethod unify* [clojure.lang.IPersistentMap clojure.lang.IPersistentMap]
  [expected-map actual-map]
  (not-empty (into {} (for [[k expected] expected-map
                            :let         [actual       (get actual-map k (symbol "nil #_\"key is not present.\""))
                                          unify-result (unify expected actual)]
                            :when        unify-result]
                        [k unify-result]))))
