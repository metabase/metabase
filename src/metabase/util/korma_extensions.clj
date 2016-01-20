(ns metabase.util.korma-extensions
  "Extensions and utility functions for [SQL Korma](http://www.sqlkorma.com/docs)."
  (:refer-clojure :exclude [+ - / * mod inc dec cast concat format])
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as s]
            (korma [core :as k]
                   [db :as kdb])
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

;;; DB util fns

;; Korma assumes dots are used to separate schemas/tables/fields, and stores names as a single string.
;; e.g. a Table name might be "public.bits", which becomes SQL like "public"."bits".
;; This works fine 99.9% of the time, but there are crazies who put dots in their Table names, e.g. "objects.stuff".
;; Since korma doesn't know how to handle this situation, we'll replace the dots *within* names with unicode
;; WHITE MEDIUM LOZENGE (⬨) and tell korma to switch the triangles back to dots when generating SQL.
;; Hopefully no one uses WHITE MEDIUM LOZENGE in their table/field names.
(def ^{:arglists '([s])} ^String escape-name   "Replace dots in a string with WHITE MEDIUM LOZENGES (⬨)." (u/rpartial s/replace #"\." "⬨"))
(def ^{:arglists '([s])} ^String unescape-name "Replace WHITE MEDIUM LOZENGES (⬨) in a string with dots." (u/rpartial s/replace #"⬨"  "."))

(defn create-db
  "Like `korma.db/create-db`, but adds a fn to unescape escaped dots when generating SQL."
  [spec]
  (update-in (kdb/create-db spec) [:options :naming :fields] comp unescape-name))

(defn combine+escape-name-components
  "Combine a sequence of keyword or string NAME-COMPONENTS into a single dot-separated korma string.
   Since korma doesn't know how to handle dots inside names, they're replaced with unicode
   WHITE MEDIUM LOZENGE (⬨), which are switched back to dots when the SQL is generated.
   Blank strings in NAME-COMPONENTS are automatically skipped."
  ^String [name-components]
  (apply str (interpose "." (for [s     name-components
                                  :when (seq s)]
                              (escape-name (name s))))))

(def ^{:arglists '([name-components])} create-entity
  "Like `korma.db/create-entity`, but takes a sequence of name components instead; escapes dots in names as well."
  (comp k/create-entity combine+escape-name-components))

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
