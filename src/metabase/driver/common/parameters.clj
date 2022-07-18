(ns metabase.driver.common.parameters
  "Various record types below are used as a convenience for differentiating the different param types."
  (:require [potemkin.types :as p.types]
            [pretty.core :as pretty]
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
;;     :value  #t "2019-09-20T19:52:00.000-07:00"}
;;
;; *  A vector of maps like the one above (for multiple values)
(p.types/defrecord+ FieldFilter [field value]
  pretty/PrettyPrintable
  (pretty [this]
    (list (pretty/qualify-symbol-for-*ns* `map->FieldFilter) (into {} this))))

(defn FieldFilter?
  "Is `x` an instance of the `FieldFilter` record type?"
  [x]
  (instance? FieldFilter x))

;; A "ReferencedCardQuery" parameter expands to the native query of the referenced card.
;;
;; `card-id` is the ID of the Card instance whose query is the value for this parameter.
;;
;; `query` is the native query as stored in the Card
;;
;; `params` are positional parameters for a parameterized native query e.g. the JDBC parameters corresponding to
;; `?` placeholders
(p.types/defrecord+ ReferencedCardQuery [card-id query params]
  pretty/PrettyPrintable
  (pretty [this]
    (list (pretty/qualify-symbol-for-*ns* `map->ReferencedCardQuery) (into {} this))))

(defn ReferencedCardQuery?
  "Is `x` an instance of the `ReferencedCardQuery` record type?"
  [x]
  (instance? ReferencedCardQuery x))

;; `ParsedQuerySnippet` is a parsed representation of the content in `NativeQuerySnippet`.
;; It is to be used as an intermediate state when subsituting parameter in a Snippet.
;;
;; `snippet-id` is the integer ID of the row in the application DB from where the snippet content is loaded.
;;
;; `parsed-query` is an array we got from parsing the raw query of the snippet
;;
;; `param->value` is a map with with template tags parsed from the raw query as keys
(p.types/defrecord+ ParsedQuerySnippet [snippet-id parsed-query param->value]
  pretty/PrettyPrintable
  (pretty [this]
    (list (pretty/qualify-symbol-for-*ns* `map->ParsedQuerySnippet) (into {} this))))

(defn ParsedQuerySnippet?
  "Is `x` an instance of the `ParsedQuerySnippet` record type?"
  [x]
  (instance? ParsedQuerySnippet x))

;; A `ReferencedQuerySnippet` expands to the partial query snippet stored in the `NativeQuerySnippet` table in the
;; application DB.
;;
;; `snippet-id` is the integer ID of the row in the application DB from where the snippet content is loaded.
;;
;; `content` is the raw query snippet which will be replaced, verbatim, for this template tag.
;;
;; `params` are positional parameters for a parameterized native query e.g. the JDBC parameters corresponding to
;; `?` placeholders
(p.types/defrecord+ ReferencedQuerySnippet [snippet-id content params]
  pretty/PrettyPrintable
  (pretty [this]
    (list (pretty/qualify-symbol-for-*ns* `map->ReferencedQuerySnippet) (into {} this))))

(defn ReferencedQuerySnippet?
  "Is `x` an instance of the `ReferencedQuerySnippet` record type?"
  [x]
  (instance? ReferencedQuerySnippet x))

;; as in a literal date, defined by date-string S
;;
;; TODO - why don't we just parse this into a Temporal type and let drivers handle it.
(p.types/defrecord+ Date [^String s]
  pretty/PrettyPrintable
  (pretty [_]
    (list (pretty/qualify-symbol-for-*ns* `->Date) s)))

(p.types/defrecord+ DateRange [start end]
  pretty/PrettyPrintable
  (pretty [_]
    (list (pretty/qualify-symbol-for-*ns* `->DateRange) start end)))

;; List of numbers to faciliate things like using params in a SQL `IN` clause. This is supported by both regular
;; filter clauses (e.g. `IN ({{ids}})` and in field filters. Field filters also support sequences of values other than
;; numbers, but these don't have a special record type. (TODO - we don't need a record type here, either. Just use a
;; sequence)
;;
;; `numbers` are a sequence of `[java.lang.Number]`
(p.types/defrecord+ CommaSeparatedNumbers [numbers]
  pretty/PrettyPrintable
  (pretty [_]
    (list (pretty/qualify-symbol-for-*ns* `->CommaSeparatedNumbers) numbers)))

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

;; Sequence of multiple values for generating a SQL IN() clause. vales
;; `values` are a sequence of `[SingleValue]`
(p.types/defrecord+ MultipleValues [values]
  pretty/PrettyPrintable
  (pretty [_]
    (list (pretty/qualify-symbol-for-*ns* `->MultipleValues) values)))

(p.types/defrecord+ Param [k]
  pretty/PrettyPrintable
  (pretty [_]
    (list (pretty/qualify-symbol-for-*ns* `->Param) k)))

(p.types/defrecord+ Optional [args]
  pretty/PrettyPrintable
  (pretty [_]
    (cons (pretty/qualify-symbol-for-*ns* `->Optional) args)))

;; `Param?` and `Optional?` exist mostly so you don't have to try to import the classes from this namespace which can
;; cause problems if the ns isn't loaded first
(defn Param?
  "Is `x` an instance of the `Param` record type?"
  [x]
  (instance? Param x))

(defn Optional?
  "Is `x` an instance of the `Optional` record type?"
  [x]
  (instance? Optional x))
