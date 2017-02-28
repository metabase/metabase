(ns metabase.driver.generic-sql.util.unprepare
  "Utility functions for converting a prepared statement with `?` into a plain SQL query."
  (:require [clojure.string :as str]
            [honeysql.core :as hsql]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx])
  (:import java.util.Date))

(defprotocol ^:private IUnprepare
  (^:private unprepare-arg ^String [this]))

(extend-protocol IUnprepare
  nil     (unprepare-arg [this] "NULL")
  String  (unprepare-arg [this] (str \' (str/replace this "'" "\\\\'") \')) ; escape single-quotes
  Boolean (unprepare-arg [this] (if this "TRUE" "FALSE"))
  Number  (unprepare-arg [this] (str this))
  Date    (unprepare-arg [this] (first (hsql/format (hsql/call :timestamp (hx/literal (u/date->iso-8601 this))))))) ; TODO - this probably doesn't work for every DB!

(defn unprepare
  "Convert a normal SQL `[statement & prepared-statement-args]` vector into a flat, non-prepared statement."
  ^String [[sql & args]]
  (loop [sql sql, [arg & more-args, :as args] args]
    (if-not (seq args)
      sql
      (recur (str/replace-first sql #"(?<!\?)\?(?!\?)" (unprepare-arg arg))
             more-args))))
