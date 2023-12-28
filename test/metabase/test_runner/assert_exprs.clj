(ns metabase.test-runner.assert-exprs
  "Custom implementations of a few [[clojure.test/is]] expressions (i.e., implementations of [[clojure.test/assert-expr]]):
  `query=`.

  Other expressions (`re=`, `=?`, and so forth) are implemented with the Hawk test-runner."
  (:require
   [clojure.data :as data]
   [clojure.test :as t]
   [clojure.walk :as walk]
   [metabase.test-runner.assert-exprs.malli-equals]))

(comment metabase.test-runner.assert-exprs.malli-equals/keep-me)

(defn derecordize
  "Convert all record types in `form` to plain maps, so tests won't fail."
  [form]
  (walk/postwalk
   (fn [form]
     (if (record? form)
       (into {} form)
       form))
   form))

(defn query=-report
  "Impl for [[t/assert-expr]] `query=`."
  [message expected actual]
  (let [expected (derecordize expected)
        actual   (derecordize actual)
        pass?    (= expected actual)]
    (merge
     {:type     (if pass? :pass :fail)
      :message  message
      :expected expected
      :actual   actual}
     ;; don't bother adding names unless the test actually failed
     (when-not pass?
       (let [add-names (requiring-resolve 'dev.debug-qp/add-names)]
         {:expected (add-names expected)
          :actual   (add-names actual)
          :diffs    (let [[only-in-actual only-in-expected] (data/diff actual expected)]
                      [[(add-names actual) [(add-names only-in-expected) (add-names only-in-actual)]]])})))))

;; basically the same as normal `=` but will add comment forms to MBQL queries for Field clauses and source tables
;; telling you the name of the referenced Fields/Tables
(defmethod t/assert-expr 'query=
  [message [_ expected & actuals]]
  `(do ~@(for [actual actuals]
           `(t/do-report
             (query=-report ~message ~expected ~actual)))))
