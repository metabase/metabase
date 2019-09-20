(ns metabase.query-processor.middleware.parameters.native.interface
  "Various record types below are used as a convenience for differentiating the different param types."
  (:require [metabase.util.schema :as su]
            [potemkin.types :as p.types]
            [pretty.core :refer [PrettyPrintable]]
            [schema.core :as s]))

;; "FieldFilter" is something that expands to a clause like "some_field BETWEEN 1 AND 10"
;;
;; `field` is a Field Toucan instance
;;
;; `value`" is either:
;; * `no-value`
;; *  A map contianing the value and type info for the value, e.g.
;;
;;    {:type   :date/single
;;     :value  #inst "2019-09-20T19:52:00.000-07:00"}
;;
;; *  A vector of maps like the one above (for multiple values)
(p.types/defrecord+ FieldFilter [field value]
  PrettyPrintable
  (pretty [this]
    (list 'map->FieldFilter (into {} this))))

(defn field-filter? [x]
  (instance? FieldFilter x))

;; as in a literal date, defined by date-string S
;; `s` is a String
(p.types/defrecord+ Date [s]
  PrettyPrintable
  (pretty [_]
    (list 'Date. s)))

(p.types/defrecord+ DateRange [start end]
  PrettyPrintable
  (pretty [_]
    (list 'DateRange. start end)))

;; List of numbers to faciliate things like using params in a SQL `IN` clause. See the discussion in `value->number`
;; for more details.
;; `numbers` are a sequence of `[java.lang.Number]`
(p.types/defrecord+ CommaSeparatedNumbers [numbers]
  PrettyPrintable
  (pretty [_]
    (list 'CommaSeperatedNumbers. numbers)))

(def no-value
  "Convenience for representing an *optional* parameter present in a query but whose value is unspecified in the param
  values."
  ::no-value)

(def SingleValue
  "Schema for a valid *single* value for a param. As of 0.28.0 params can either be single-value or multiple value."
  (s/cond-pre (s/eq no-value)
              CommaSeparatedNumbers
              FieldFilter
              Date
              s/Num
              s/Str
              s/Bool))

(def ParamValue
  "Schema for a parameter *value* during parsing by the `values` namespace, and also (confusingly) for the `:value` part
  of a `FieldFilter`, which gets passed along to `substitution`. TODO - this is horribly confusing"
  {:type                     s/Keyword ; TODO - what types are allowed? :text, ...?
   (s/optional-key :target)  s/Any
   ;; not specified if the param has no value. TODO - make this stricter
   (s/optional-key :value)   s/Any
   ;; The following are not used by the code in this namespace but may or may not be specified depending on what the
   ;; code that constructs the query params is doing. We can go ahead and ignore these when present.
   (s/optional-key :slug)    su/NonBlankString
   (s/optional-key :name)    su/NonBlankString
   (s/optional-key :default) s/Any
   (s/optional-key :id)      s/Any}) ; used internally by the frontend

;; Sequence of multiple values for generating a SQL IN() clause. vales
;; `values` are a sequence of `[SingleValue]`
(p.types/defrecord+ MultipleValues [values]
  PrettyPrintable
  (pretty [_]
    (list 'MultipleValues. values)))

(p.types/defrecord+ Param [k]
  PrettyPrintable
  (pretty [_]
          (list 'param k)))

(p.types/defrecord+ Optional [args]
  PrettyPrintable
  (pretty [_]
          (cons 'optional args)))

(defn Param? [x]
  (instance? Param x))

(defn Optional? [x]
  (instance? Optional x))

(defmulti required-params
  {:arglists '([x])}
  class)

(defmethod required-params :default
  [_]
  nil)

(defmethod required-params Param
  [param]
  #{(:k param)})

(defmethod required-params Optional
  [optional]
  (set (mapcat required-params (:args optional))))
