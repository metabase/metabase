(ns metabase.driver.sql.util.unprepare
  "Utility functions for converting a prepared statement with `?` into a plain SQL query."
  (:require [clojure.string :as str]
            [honeysql.core :as hsql]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]])
  (:import java.sql.Time
           java.util.Date))

(defprotocol ^:private IUnprepare
  (^:private unprepare-arg ^String [this settings]))

(defn- unprepare-date [date-or-time iso-8601-fn]
  (hsql/call iso-8601-fn (hx/literal (du/date->iso-8601 date-or-time))))

(extend-protocol IUnprepare
  nil     (unprepare-arg [_ _] "NULL")
  String  (unprepare-arg [this {:keys [quote-escape]}] (str \' (str/replace this "'" (str quote-escape "'")) \')) ; escape single-quotes
  Boolean (unprepare-arg [this _] (if this "TRUE" "FALSE"))
  Number  (unprepare-arg [this _] (str this))
  Date    (unprepare-arg [this {:keys [iso-8601-fn]}] (first (hsql/format (unprepare-date this iso-8601-fn))))
  Time    (unprepare-arg [this {:keys [iso-8601-fn]}] (first (hsql/format (hx/->time (unprepare-date this iso-8601-fn))))))

(defn unprepare
  "Convert a normal SQL `[statement & prepared-statement-args]` vector into a flat, non-prepared statement."
  ^String [[sql & args] & {:keys [quote-escape iso-8601-fn], :or {quote-escape "\\\\", iso-8601-fn :timestamp}}]
  (loop [sql sql, [arg & more-args, :as args] args]
    (if-not (seq args)
      sql
      (recur (str/replace-first sql #"(?<!\?)\?(?!\?)" (unprepare-arg arg {:quote-escape quote-escape, :iso-8601-fn iso-8601-fn}))
             more-args))))
