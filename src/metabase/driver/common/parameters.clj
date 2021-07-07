(ns metabase.driver.common.parameters
  "Various record types below are used as a convenience for differentiating the different param types."
  (:require [metabase.models.setting :refer [defsetting]]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.util.i18n :as i18n :refer [deferred-tru tru]]
            [metabase.util.schema :as su]
            [potemkin.types :as p.types]
            [pretty.core :as pretty]
            [schema.core :as s]))

(defsetting field-filter-operators-enabled?
  (deferred-tru "Enable the new field-filter operators")
  :type       :boolean
  :visibility :public
  :setter     :none)

(defn throw-if-field-filter-operators-not-enabled
  "Feature flag check for new field filter operations. Assumed already has been checked that `ops/operator?` is
  true. Throws if the new field filter operators are not enabled. Intended to be removed when feature flag is no
  longer necessary; designed so it can be used in a threading context and just raised out."
  {:added "0.39.0"}
  [field-filter]
  (if (field-filter-operators-enabled?)
    field-filter
    (throw (ex-info (tru "New field filter operators are not enabled")
                    {:type qp.error-type/invalid-parameter
                     :operator (:type field-filter)}))))

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
;; `parameters` are positional parameters for a parameterized native query e.g. the JDBC parameters corresponding to
;; `?` placeholders
(p.types/defrecord+ ReferencedCardQuery [card-id query params]
  pretty/PrettyPrintable
  (pretty [this]
    (list (pretty/qualify-symbol-for-*ns* `map->ReferencedCardQuery) (into {} this))))

(defn ReferencedCardQuery?
  "Is `x` an instance of the `ReferencedCardQuery` record type?"
  [x]
  (instance? ReferencedCardQuery x))

;; A `ReferencedQuerySnippet` expands to the partial query snippet stored in the `NativeQuerySnippet` table in the
;; application DB.
;;
;; `snippet-id` is the integer ID of the row in the application DB from where the snippet content is loaded.
;;
;; `content` is the raw query snippet which will be replaced, verbatim, for this template tag.
(p.types/defrecord+ ReferencedQuerySnippet [snippet-id content]
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
   ;; various other keys are used internally by the frontend
   s/Keyword                 s/Any})

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
