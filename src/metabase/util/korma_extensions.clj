(ns metabase.util.korma-extensions
  "Extensions and utility functions for [SQL Korma](http://www.sqlkorma.com/docs)."
  (:refer-clojure :exclude [+ - / * mod inc dec cast concat format])
  (:require [clojure.core.match :refer [match]]
            [korma.core :as k]
            (korma.sql [engine :as kengine]
                       [utils :as kutils])
            [metabase.util :as u]))

;;; Korma bugfixes

;; `korma.sql.fns/pred-not=` doesn't take into account `false` values, and ends up generating SQL appropriate for `nil`,
;; such as "WHERE `field` IS NOT `false`". This is invalid and causes most of our DBs to explode.
;; Replace this wonky implementation with one that works properly
(defn- pred-not= [x y]
  (match [x y]
    [nil nil] nil
    [  _ nil] (kengine/infix x "IS NOT" y)
    [nil   _] (kengine/infix y "IS NOT" x)
    [  _   _] (kengine/infix x "<>" y)))

(intern 'korma.sql.fns 'pred-not= pred-not=)


;;; util fns

(defn wrap
  "Wrap form X in parentheses."
  [x]
  (kutils/func "(%s)" [x]))

(defn infix
  "Interpose OPERATOR between ARGS and wrap the result in parentheses.

     (infix \"+\" :x :y :z) -> \"(x + y + z)\";"
  [operator x y & more]
  (let [x+y (kengine/infix x operator y)]
    (if (seq more)
      (apply infix operator x+y more)
      (wrap x+y))))

(defn math-infix
  "Interpose OPERATOR between ARGS and wrap the result in parentheses.
   Integer literals in ARGS are automatically wrapped in a `k/raw` form."
  [operator & args]
  (apply infix operator (for [arg args]
                          (cond-> arg
                            (integer? arg) k/raw))))

(def ^{:arglists '([& exprs])}  +  (partial math-infix "+"))
(def ^{:arglists '([& exprs])}  -  (partial math-infix "-"))
(def ^{:arglists '([& exprs])}  /  (partial math-infix "/"))
(def ^{:arglists '([& exprs])}  *  (partial math-infix "*"))
(def ^{:arglists '([& exprs])} mod (partial math-infix "%"))

(defn inc [x] (+ x 1))
(defn dec [x] (- x 1))

(defn literal [s]
  (k/raw (str \' (name s) \')))

(defn cast
  "Generate a statement like `CAST(x AS c)`/"
  [c x]
  (kutils/func (clojure.core/format "CAST(%%s AS %s)" (name c))
               [x]))

(defn format [format-str expr]
  (k/sqlfn :FORMAT expr (literal format-str)))

(defn ->date                     [x] (cast :DATE x))
(defn ->datetime                 [x] (cast :DATETIME x))
(defn ->timestamp                [x] (cast :TIMESTAMP x))
(defn ->timestamp-with-time-zone [x] (cast "TIMESTAMP WITH TIME ZONE" x))
(defn ->integer                  [x] (cast :INTEGER x))

;;; Random SQL fns. Not all DBs support all these!
(def ^{:arglists '([& exprs])} floor   (partial k/sqlfn* :FLOOR))
(def ^{:arglists '([& exprs])} hour    (partial k/sqlfn* :HOUR))
(def ^{:arglists '([& exprs])} minute  (partial k/sqlfn* :MINUTE))
(def ^{:arglists '([& exprs])} week    (partial k/sqlfn* :WEEK))
(def ^{:arglists '([& exprs])} month   (partial k/sqlfn* :MONTH))
(def ^{:arglists '([& exprs])} quarter (partial k/sqlfn* :QUARTER))
(def ^{:arglists '([& exprs])} year    (partial k/sqlfn* :YEAR))
(def ^{:arglists '([& exprs])} concat  (partial k/sqlfn* :CONCAT))
