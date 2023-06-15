(ns metabase.driver.sql-jdbc.execute-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]))

(deftest ^:parallel Options-test
  (are [options error] (= error
                          (me/humanize (mc/explain sql-jdbc.execute/Options options)))
    nil                              nil
    {}                               nil
    {:session-timezone nil}          nil
    {:session-timezone "US/Pacific"} nil
    {:session-timezone "X"}          {:session-timezone ["invalid timezone ID: \"X\""]}))
