(ns metabase.test-runner.effects
  "A namespace for side-effecting test utilities to ensure we can always run subselections of tests. There should be no
  macros in here. Those should go in the other test namespaces. This is to ensure that any helpers like `schema=` are
  present since this defmethod isn't required in the namespaces where it is used.

  Ex:
  clojure -X:dev:test :only '\"test/metabase/pulse/render\"'

  This would not have had the random namespace that requires these helpers and the run fails.
  "
  (:require [clojure.test :as t]
            [schema.core :as s]))

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
