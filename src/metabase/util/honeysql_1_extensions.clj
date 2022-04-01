(ns metabase.util.honeysql-1-extensions
  "Legacy HoneySQL 1.x extensions (for application DB use). Use [[metabase.util.honeysql-extensions]] for QP/driver code."
  (:refer-clojure :exclude [+ - / * mod inc dec cast concat format])
  (:require [clojure.string :as str]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [metabase.util :as u]
            [potemkin.types :as p.types]
            [pretty.core :as pretty])
  (:import honeysql.format.ToSql))

;; register the function `distinct-count` with HoneySQL
;; (hsql/format :%distinct-count.x) -> "count(distinct x)"
(defmethod hformat/fn-handler "distinct-count" [_ field]
  (str "count(distinct " (hformat/to-sql field) ")"))

;; HoneySQL 0.7.0+ parameterizes numbers to fix issues with NaN and infinity -- see
;; https://github.com/jkk/honeysql/pull/122. However, this broke some of Metabase's behavior, specifically queries
;; with calculated columns with numeric literals -- some SQL databases can't recognize that a calculated field in a
;; SELECT clause and a GROUP BY clause is the same thing if the calculation involves parameters. Go ahead an use the
;; old behavior so we can keep our HoneySQL dependency up to date.
(extend-protocol hformat/ToSql
  Number
  (to-sql [x] (str x)))

;; Single-quoted string literal
(p.types/defrecord+ Literal [literal]
  ToSql
  (to-sql [_]
    (as-> literal <>
      (str/replace <> #"(?<![\\'])'(?![\\'])"  "''")
      (str \' <> \')))
  pretty/PrettyPrintable
  (pretty [_]
    (list `literal literal)))

;; as with `Identifier` you should use the the `literal` function below instead of the auto-generated factory functions.
(alter-meta! #'->Literal    assoc :private true)
(alter-meta! #'map->Literal assoc :private true)

(defn literal
  "Wrap keyword or string `s` in single quotes and a HoneySQL `raw` form.

  We'll try to escape single quotes in the literal, unless they're already escaped (either as `''` or as `\\`, but
  this won't handle wacky cases like three single quotes in a row.

  DON'T USE `LITERAL` FOR THINGS THAT MIGHT BE WACKY (USER INPUT). Only use it for things that are hardcoded."
  [s]
  (Literal. (u/qualified-name s)))

(def ^{:arglists '([& exprs])}  +  "Math operator. Interpose `+` between `exprs` and wrap in parentheses." (partial hsql/call :+))
(def ^{:arglists '([& exprs])}  -  "Math operator. Interpose `-` between `exprs` and wrap in parentheses." (partial hsql/call :-))
(def ^{:arglists '([& exprs])}  /  "Math operator. Interpose `/` between `exprs` and wrap in parentheses." (partial hsql/call :/))
(def ^{:arglists '([& exprs])}  *  "Math operator. Interpose `*` between `exprs` and wrap in parentheses." (partial hsql/call :*))
(def ^{:arglists '([& exprs])} mod "Math operator. Interpose `%` between `exprs` and wrap in parentheses." (partial hsql/call :%))

(defn inc "Add 1 to `x`."        [x] (+ x 1))
(defn dec "Subtract 1 from `x`." [x] (- x 1))

(defn cast
  "Generate a statement like `cast(expr AS sql-type)`."
  [database-type expr]
  (hsql/call :cast expr (hsql/raw (name database-type))))

(defn format
  "SQL `format` function."
  [format-str expr]
  (hsql/call :format expr (literal format-str)))

(defn round
  "SQL `round` function."
  [x decimal-places]
  (hsql/call :round x decimal-places))

(defn ->date                     "CAST `x` to a `date`."                     [x] (cast :date x))
(defn ->datetime                 "CAST `x` to a `datetime`."                 [x] (cast :datetime x))
(defn ->timestamp                "CAST `x` to a `timestamp`."                [x] (cast :timestamp x))
(defn ->timestamp-with-time-zone "CAST `x` to a `timestamp with time zone`." [x] (cast "timestamp with time zone" x))
(defn ->integer                  "CAST `x` to a `integer`."                  [x] (cast :integer x))
(defn ->time                     "CAST `x` to a `time` datatype"             [x] (cast :time x))
(defn ->boolean                  "CAST `x` to a `boolean` datatype"          [x] (cast :boolean x))

;;; Random SQL fns. Not all DBs support all these!
(def ^{:arglists '([& exprs])} floor   "SQL `floor` function."   (partial hsql/call :floor))
(def ^{:arglists '([& exprs])} hour    "SQL `hour` function."    (partial hsql/call :hour))
(def ^{:arglists '([& exprs])} minute  "SQL `minute` function."  (partial hsql/call :minute))
(def ^{:arglists '([& exprs])} day     "SQL `day` function."     (partial hsql/call :day))
(def ^{:arglists '([& exprs])} week    "SQL `week` function."    (partial hsql/call :week))
(def ^{:arglists '([& exprs])} month   "SQL `month` function."   (partial hsql/call :month))
(def ^{:arglists '([& exprs])} quarter "SQL `quarter` function." (partial hsql/call :quarter))
(def ^{:arglists '([& exprs])} year    "SQL `year` function."    (partial hsql/call :year))
(def ^{:arglists '([& exprs])} concat  "SQL `concat` function."  (partial hsql/call :concat))
