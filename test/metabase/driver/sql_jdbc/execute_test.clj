(ns metabase.driver.sql-jdbc.execute-test
  (:require
   [clojure.test :refer :all]
   [malli.error :as me]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel ConnectionOptions-test
  (are [options error] (= error
                          (me/humanize (mr/explain sql-jdbc.execute/ConnectionOptions options)))
    nil                              nil
    {}                               nil
    {:session-timezone nil}          nil
    {:session-timezone "US/Pacific"} nil
    {:session-timezone "X"}          {:session-timezone ["invalid timezone ID: \"X\"" "timezone offset string literal"]}))
