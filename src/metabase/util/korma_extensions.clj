(ns metabase.util.korma-extensions
  "Extensions and utility functions for [SQL Korma](http://www.sqlkorma.com/docs)."
  (:refer-clojure :exclude [+ - / * inc dec cast])
  (:require (korma [core :as k])
            (korma.sql [engine :as kengine]
                       [utils :as kutils])
            [metabase.util :as u]))

;; TODO - this probably isn't needed, it would be better just to compose things instead
(defn funcs
  "Convenience for writing nested `kutils/func` forms.
   The first argument is treated the same as with `kutils/func`;
   But when any arg is a vector we'll treat it as a recursive call to `funcs`.

     (funcs \"CONCAT(%s)\" [\"YEAR(%s)\" x] y [\"MONTH(%s)\" z])
       -> (utils/func \"CONCAT(%s)\" [(utils/func \"YEAR(%s)\" [x])
                                      y
                                      (utils/func \"MONTH(%s)\" [z])])"
  [fn-format-str & args]
  (kutils/func fn-format-str (vec (for [arg args]
                                    (if (vector? arg) (apply funcs arg)
                                        arg)))))


(defn wrap [x] (kutils/func "(%s)" [x]))

(defn- infix* [operator x y & more]
  (let [x+y (kengine/infix x operator y)]
    (if (seq more)
      (apply infix* operator x+y more)
      (wrap x+y))))

(def ^{:arglists '([& vs])} + (partial infix* "+"))
(def ^{:arglists '([& vs])} - (partial infix* "-"))
(def ^{:arglists '([& vs])} / (partial infix* "/"))
(def ^{:arglists '([& vs])} * (partial infix* "*"))

(defn inc [x] (+ x (k/raw 1)))
(defn dec [x] (- x (k/raw 1)))

(defn literal [s]
  (k/raw (str \' (name s) \')))

(defn cast [c x]
  (kutils/func (format "CAST(%%s AS %s)" (name c))
               [x]))

(defn ->date                     [x] (cast :DATE x))
(defn ->timestamp                [x] (cast :TIMESTAMP x))
(defn ->timestamp-with-time-zone [x] (cast "TIMESTAMP WITH TIME ZONE" x))

;;; Random SQL fns. Not all DBs support all these!
(defn floor   [x] (k/sqlfn :FLOOR x))
(defn hour    [x] (k/sqlfn :HOUR x))
(defn minute  [x] (k/sqlfn :MINUTE x))
(defn week    [x] (k/sqlfn :WEEK x))
(defn month   [x] (k/sqlfn :MONTH x))
(defn quarter [x] (k/sqlfn :QUARTER x))
(defn year    [x] (k/sqlfn :YEAR x))
