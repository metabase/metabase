(ns metabase.test-runner.effects
  "A namespace for side-effecting test utilities to ensure we can always run subselections of tests. There should be no
  macros in here. Those should go in the other test namespaces. This is to ensure that any helpers like `schema=` are
  present since this defmethod isn't required in the namespaces where it is used.

  Ex:
  clojure -X:dev:test :only '\"test/metabase/pulse/render\"'

  This would not have had the random namespace that requires these helpers and the run fails.
  "
  (:require
   [clojure.data :as data]
   [clojure.test :as t]
   [dev.debug-qp]
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

;; basically the same as normal `=` but will add comment forms to MBQL queries for Field clauses and source tables
;; telling you the name of the referenced Fields/Tables
(defmethod t/assert-expr 'query=
  [message [_ expected actual :as args]]
  `(let [expected# ~expected
         actual#   ~actual
         pass?#    (= expected# actual#)
         expected# (dev.debug-qp/add-names expected#)
         actual#   (dev.debug-qp/add-names actual#)]
     (t/do-report
      {:type     (if pass?# :pass :fail)
       :message  ~message
       :expected expected#
       :actual   actual#
       :diffs    (when-not pass?#
                   (let [[only-in-actual# only-in-expected#] (data/diff actual# expected#)]
                     [[actual# [only-in-expected# only-in-actual#]]]))})))
