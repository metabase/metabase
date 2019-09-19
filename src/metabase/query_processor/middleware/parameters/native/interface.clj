(ns metabase.query-processor.middleware.parameters.native.interface
  "Various record types below are used as a convenience for differentiating the different param types."
  (:require [pretty.core :refer [PrettyPrintable]]
            [schema
             [core :as s]
             [potemkin :as s.p]])
  (:import metabase.models.field.FieldInstance))

;; "FieldFilter" is something that expands to a clause like "some_field BETWEEN 1 AND 10"
(s.p/defrecord+ FieldFilter [field :- FieldInstance
                             ;; param is either single param or a vector of params
                             param]
  PrettyPrintable
  (pretty [_]
    (list 'FieldFilter. field param)))

;; as in a literal date, defined by date-string S
(s.p/defrecord+ Date [s :- s/Str]
  PrettyPrintable
  (pretty [_]
    (list 'Date. s)))

(s.p/defrecord+ DateRange [start end]
  PrettyPrintable
  (pretty [_]
    (list 'DateRange. start end)))

;; List of numbers to faciliate things like using params in a SQL `IN` clause. See the discussion in `value->number`
;; for more details.
(s.p/defrecord+ CommaSeparatedNumbers [numbers :- [s/Num]]
  PrettyPrintable
  (pretty [_]
    (list 'CommaSeperatedNumbers. numbers)))

;; convenience for representing an *optional* parameter present in a query but whose value is unspecified in the param
;; values.
(s.p/defrecord+ NoValue []
  PrettyPrintable
  (pretty [_]
    '(NoValue.)))

(defn no-value?
  "Is `x` an instance of `NoValue` -- does it represent an optional parameter present in the query whose value is
  unspecified?"
  [x]
  (instance? NoValue x))

(def SingleValue
  "Schema for a valid *single* value for a param. As of 0.28.0 params can either be single-value or multiple value."
  (s/cond-pre NoValue
              CommaSeparatedNumbers
              FieldFilter
              Date
              s/Num
              s/Str
              s/Bool))

(def ParamValue
  "Schema for a parameter *value*, passed in as part of the `:parameters` list."
  {:type                     s/Keyword  ; TODO - what types are allowed? :text, ...?
   :target                   s/Any
   ;; not specified if the param has no value. TODO - make this stricter
   (s/optional-key :value)   s/Any
   ;; The following are not used by the code in this namespace but may or may not be specified depending on what the
   ;; code that constructs the query params is doing. We can go ahead and ignore these when present.
   (s/optional-key :slug)    su/NonBlankString
   (s/optional-key :name)    su/NonBlankString
   (s/optional-key :default) s/Any
   (s/optional-key :id)      s/Any}) ; used internally by the frontend

;; Sequence of multiple values for generating a SQL IN() clause. vales
(s.p/defrecord+ MultipleValues [values :- [SingleValue]]
  PrettyPrintable
  (pretty [_]
          (list 'MultipleValues. values)))

(s.p/defrecord+ Param [k]
  PrettyPrintable
  (pretty [_]
          (list 'param k)))

(s.p/defrecord+ Optional [args]
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
  (set (mapcat required-params (:strs-and-params optional))))
