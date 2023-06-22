(ns metabase.test-runner.assert-exprs
  "Custom implementations of a few [[clojure.test/is]] expressions (i.e., implementations of [[clojure.test/assert-expr]]):
  `query=` and `sql=`.

  Other expressions (`re=`, `schema=`, `=?`, and so forth) are implemented with the Hawk test-runner."
  (:require
   [clojure.data :as data]
   [clojure.test :as t]
   [clojure.walk :as walk]))

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

(defn sql=-report
  [message expected query]
  (let [sql-map ((requiring-resolve 'metabase.driver.sql.query-processor-test-util/query->sql-map)
                 query)
        pass?   (= sql-map expected)]
    {:type     (if pass? :pass :fail)
     :message  message
     :expected expected
     :actual   sql-map
     :diffs    (when-not pass?
                 (let [[only-in-actual only-in-expected] (data/diff sql-map expected)]
                   [[sql-map [only-in-expected only-in-actual]]]))}))

(defmethod t/assert-expr 'sql=
  [message [_ expected query]]
  `(let [query# ~query]
     ;; [[t/testing]] context has to be done around the call to [[t/do-report]]
     ((requiring-resolve 'metabase.driver.sql.query-processor-test-util/do-with-native-query-testing-context)
      query#
      ;; [[t/do-report]] has to be in the expansion, otherwise it picks up the wrong filename and line metadata.
      (fn []
        (t/do-report
         (sql=-report ~message ~expected query#))))))
