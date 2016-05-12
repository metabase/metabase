(ns metabase.util.honeysql-extensions
  (:refer-clojure :exclude [+ - / * mod inc dec cast concat format])
  (:require [honeysql.core :as hsql]))

(def ^{:arglists '([& exprs])}  +  "Math operator. Interpose `+` between EXPRS and wrap in parentheses." (partial hsql/call :+))
(def ^{:arglists '([& exprs])}  -  "Math operator. Interpose `-` between EXPRS and wrap in parentheses." (partial hsql/call :-))
(def ^{:arglists '([& exprs])}  /  "Math operator. Interpose `/` between EXPRS and wrap in parentheses." (partial hsql/call :/))
(def ^{:arglists '([& exprs])}  *  "Math operator. Interpose `*` between EXPRS and wrap in parentheses." (partial hsql/call :*))
(def ^{:arglists '([& exprs])} mod "Math operator. Interpose `%` between EXPRS and wrap in parentheses." (partial hsql/call :%))

(defn inc "Add 1 to X."        [x] (+ x 1))
(defn dec "Subtract 1 from X." [x] (- x 1))

(defn literal
  "Wrap keyword or string S in single quotes and a korma `raw` form."
  [s]
  (hsql/raw (str \' (name s) \')))

(defn cast
  "Generate a statement like `cast(x AS c)`/"
  [c x]
  (hsql/call :cast x (hsql/raw (name c))))

(defn ->date                     "CAST X to a `date`."                     [x] (cast :date x))
(defn ->datetime                 "CAST X to a `datetime`."                 [x] (cast :datetime x))
(defn ->timestamp                "CAST X to a `timestamp`."                [x] (cast :timestamp x))
(defn ->timestamp-with-time-zone "CAST X to a `timestamp with time zone`." [x] (cast "timestamp with time zone" x))
(defn ->integer                  "CAST X to a `integer`."                  [x] (cast :integer x))

;;; Random SQL fns. Not all DBs support all these!
(def ^{:arglists '([& exprs])} floor   "SQL `floor` function."  (partial hsql/call :floor))
(def ^{:arglists '([& exprs])} hour    "SQL `hour` function."   (partial hsql/call :hour))
(def ^{:arglists '([& exprs])} minute  "SQL `minute` function." (partial hsql/call :minute))
(def ^{:arglists '([& exprs])} week    "SQL `week` function."   (partial hsql/call :week))
(def ^{:arglists '([& exprs])} month   "SQL `month` function."  (partial hsql/call :month))
(def ^{:arglists '([& exprs])} quarter "SQL `quarter` function."(partial hsql/call :quarter))
(def ^{:arglists '([& exprs])} year    "SQL `year` function."   (partial hsql/call :year))
(def ^{:arglists '([& exprs])} concat  "SQL `concat` function." (partial hsql/call :concat))
