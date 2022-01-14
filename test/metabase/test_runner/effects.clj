(ns metabase.test-runner.effects
  "A namespace for side-effecting test utilities to ensure we can always run subselections of tests. There should be no
  macros in here. Those should go in the other test namespaces. This is to ensure that any helpers like `schema=` are
  present since this defmethod isn't required in the namespaces where it is used.

  Ex:
  clojure -X:dev:test :only '\"test/metabase/pulse/render\"'

  This would not have had the random namespace that requires these helpers and the run fails.
  "
  (:require [clojure.data :as data]
            [clojure.test :as t]
            [metabase.util.date-2 :as date-2]
            [metabase.util.i18n.impl :as i18n.impl]
            [schema.core :as s]))

(comment
  ;; these are necessary so data_readers.clj functions can function
  date-2/keep-me
  i18n.impl/keep-me)

(defmethod t/assert-expr 're= [msg [_ pattern actual]]
  `(let [pattern#  ~pattern
         actual#   ~actual
         matches?# (some->> actual# (re-matches pattern#))]
     (assert (instance? java.util.regex.Pattern pattern#))
     (t/do-report
      {:type     (if matches?# :pass :fail)
       :message  ~msg
       :expected pattern#
       :actual   actual#
       :diffs    (when-not matches?#
                   [[actual# [pattern# nil]]])})))

(defmethod t/assert-expr 'schema=
  [message [_ schema actual]]
  `(let [schema# ~schema
         actual# ~actual
         pass?#  (nil? (s/check schema# actual#))]
     (t/do-report
      {:type     (if pass?# :pass :fail)
       :message  ~message
       :expected (s/explain schema#)
       :actual   actual#
       :diffs    (when-not pass?#
                   [[actual# [(s/check schema# actual#) nil]]])})))

(defn query=-report
  "Impl for [[t/assert-expr]] `query=`."
  [message expected actual]
  (let [pass? (= expected actual)]
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
  [message [_ expected actual]]
  `(t/do-report
    (query=-report ~message ~expected ~actual)))

;; `partial=` is like `=` but only compares stuff (using [[data/diff]] that's in `expected`. Anything else is ignored.

(defn- remove-keys-not-in-expected
  "Remove all the extra stuff (i.e. extra map keys or extra sequence elements) from the `actual` diff that's not
  in the original `expected` form."
  [expected actual]
  (println "(pr-str expected) (pr-str actual):" (pr-str expected) (pr-str actual)) ; NOCOMMIT
  (cond
    (and (map? expected) (map? actual))
    (into {}
          (comp (filter (fn [[k v]]
                          (contains? expected k)))
                (map (fn [[k v]]
                       [k (remove-keys-not-in-expected (get expected k) v)])))
          actual)

    (and (sequential? expected) (sequential? actual))
    (into
     [(remove-keys-not-in-expected (first expected) (first actual))]
     (when (next expected)
       (remove-keys-not-in-expected (next expected) (next actual))))

    :else
    actual))

(defn partial=-report
  [message expected actual]
  (let [actual'                           (remove-keys-not-in-expected expected actual)
        [only-in-actual only-in-expected] (data/diff actual' expected)
        pass?                             (if (coll? only-in-expected)
                                            (empty? only-in-expected)
                                            (nil? only-in-expected))]
    {:type     (if pass? :pass :fail)
     :message  message
     :expected expected
     :actual   actual
     :diffs    [[actual [only-in-expected only-in-actual]]]}))

(defmethod t/assert-expr 'partial=
  [message [_ expected actual]]
  `(t/do-report
    (partial=-report ~message ~expected ~actual)))
