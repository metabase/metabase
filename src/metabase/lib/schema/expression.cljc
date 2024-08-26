(ns metabase.lib.schema.expression
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.common :as common]
   [metabase.shared.util.i18n :as i18n]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defmulti type-of-method
  "Impl for [[type-of]]. Use [[type-of]], but implement [[type-of-method]].

  For MBQL clauses, try really hard not return an ambiguous set of possible types! Calculate things and determine what
  the result type will be!

  If we don't have enough information to determine the type (e.g. a `:field` clause that needs a metadata provider to
  determine the type), return `::expression/type.unknown`. This is a temporary workaround until we figure out how to
  always have type info!"
  {:arglists '([expr])}
  (fn [x]
    ;; For the fallback case: use the actual type/class name as the dispatch type rather than `:type/*`. This is so we
    ;; can implement support for some platform-specific classes like `BigDecimal` or `java.time.OffsetDateTime`, for
    ;; use inside QP code or whatever. In the future maybe we can add support for JS-specific stuff too.
    (let [dispatch-value (lib.dispatch/dispatch-value x)]
      (if (= dispatch-value :dispatch-type/*)
        (type x)
        dispatch-value)))
  :hierarchy lib.hierarchy/hierarchy)

(mr/def ::base-type
  [:multi {:dispatch (partial = ::type.unknown)}
   [true  [:= ::type.unknown]]
   [false [:ref ::common/base-type]]])

(mu/defn type-of :- [:multi
                     {:dispatch set?}
                     [true  [:set {:min 2} [:ref ::base-type]]]
                     [false [:ref ::base-type]]]
  "Determine the type of an MBQL expression. Returns either a type keyword, or if the type is ambiguous, a set of
  possible types."
  [expr]
  (or
   ;; for MBQL clauses with `:effective-type` or `:base-type` in their options: ignore their dumb [[type-of-method]] methods
   ;; and return that type directly. Ignore everything else! Life hack!
   (and (common/mbql-clause-tag expr)
        (map? (second expr))
        (or (:effective-type (second expr))
            (:base-type (second expr))))
   (type-of-method expr)))

(defmethod type-of-method :default
  [expr]
  (throw (ex-info (i18n/tru "{0}: Don''t know how to determine the type of {1}" `type-of (pr-str expr))
                  {:expr expr})))

;;; for MBQL clauses whose type is the same as the type of the first arg. Also used
;;; for [[metabase.lib.metadata.calculation/type-of-method]].
(defmethod type-of-method :lib.type-of/type-is-type-of-first-arg
  [[_tag _opts expr]]
  (type-of expr))

(defn- is-type? [x y]
  (cond
    (set? x)             (some #(is-type? % y) x)
    (set? y)             (some #(is-type? x %) y)
    (= x ::type.unknown) true
    :else                (isa? x y)))

(defn type-of?
  "Whether the [[type-of]] `expr` isa? [[metabase.types]] `base-type`."
  [expr base-type]
  (let [expr-type (type-of expr)]
    (assert ((some-fn keyword? set?) expr-type)
            (i18n/tru "type-of {0} returned an invalid type {1}" (pr-str expr) (pr-str expr-type)))
    (is-type? expr-type base-type)))

(def ^:dynamic *suppress-expression-type-check?*
  "Set this `true` to skip any type checks for expressions. This is useful while constructing expressions in MLv2 with
  full metadata, but it breaks during legacy conversion in some cases.

  In particular, if you override the metadata for a column to eg. treat a `:type/Integer` columns as a `:type/Instant`
  with `:Coercion/UNIXSeconds->DateTime`, it will have `:base-type :type/Integer` and `:effective-type :type/Instant`.
  But when converting from legacy, the `:field` refs in eg. a filter will only have `:base-type :type/Integer`, and then
  the filter fails Malli validation. See #41122."
  false)

(defn- expression-schema
  "Schema that matches the following rules:

  1a. expression is *not* an MBQL clause, OR

  1b. expression is an registered MBQL clause and matches the schema registered
      with [[metabase.lib.schema.mbql-clause]], AND

  2. expression's [[type-of]] isa? `base-type`"
  [base-type description]
  [:and
   ;; vector = MBQL clause, anything else = not an MBQL clause
   [:multi
    {:dispatch vector?}
    [true  [:ref :metabase.lib.schema.mbql-clause/clause]]
    [false [:ref :metabase.lib.schema.literal/literal]]]
   [:fn
    {:error/message description}
    #(or *suppress-expression-type-check?*
         (type-of? % base-type))]])

(mr/def ::boolean
  (expression-schema :type/Boolean "expression returning a boolean"))

(mr/def ::string
  (expression-schema :type/Text "expression returning a string"))

(mr/def ::integer
  (expression-schema :type/Integer "expression returning an integer"))

(mr/def ::non-integer-real
  (expression-schema :type/Float "expression returning a non-integer real number"))

(mr/def ::number
  (expression-schema :type/Number "expression returning a number"))

(mr/def ::date
  (expression-schema :type/Date "expression returning a date"))

(mr/def ::time
  (expression-schema :type/Time "expression returning a time"))

(mr/def ::datetime
  (expression-schema :type/DateTime "expression returning a date time"))

(mr/def ::temporal
  (expression-schema :type/Temporal "expression returning a date, time, or date time"))

(def orderable-types
  "Set of base types that are orderable."
  #{:type/Text :type/Number :type/Temporal :type/Boolean :type/MongoBSONID})

(mr/def ::orderable
  (expression-schema orderable-types
                     "an expression that can be compared with :> or :<"))

(defn comparable-expressions?
  "Returns whether expressions `x` and `y` can be compared.

  Expressions are comparable if their types are comparable.
  Two types t1 and t2 are comparable if either one is ::type.unknown, or
  there is an orderable type t such that both `t1` and `t2` are assignable to t."
  [x y]
  (some boolean
        (for [t1 (u/one-or-many (type-of x))
              t2 (u/one-or-many (type-of y))
              t orderable-types]
          (or (= t1 ::type.unknown)
              (= t2 ::type.unknown)
              (and (types/assignable? t1 t)
                   (types/assignable? t2 t))))))

(def equality-comparable-types
  "Set of base types that can be compared with equality."
  ;; TODO: Adding :type/* here was necessary to prevent type errors for queries where a field's type in the DB could not
  ;; be determined better than :type/*. See #36841, where a MySQL enum field used to get `:base-type :type/*`, and this check
  ;; would fail on `[:= {} [:field ...] "enum-str"]` without `:type/*` here.
  ;; This typing of each input should be replaced with an alternative scheme that checks that it's plausible to compare
  ;; all the args to an `:=` clause. Eg. comparing `:type/*` and `:type/String` is cool. Comparing `:type/IPAddress` to
  ;; `:type/Boolean` should fail; we can prove it's the wrong thing to do.
  #{:type/Boolean :type/Text :type/Number :type/Temporal :type/IPAddress :type/MongoBSONID :type/Array :type/*})

(derive :type/Text        ::emptyable)
(derive :type/MongoBSONID ::emptyable)

(mr/def ::emptyable
  (expression-schema ::emptyable "expression returning something emptyable (e.g. a string or BSON ID)"))

(mr/def ::equality-comparable
  [:maybe
   (expression-schema equality-comparable-types
                      "an expression that can appear in := or :!=")])

;;; any type of expression.
(mr/def ::expression
  [:maybe (expression-schema :type/* "any type of expression")])

(mr/def ::expression.definition
  [:and
   [:ref ::expression]
   [:cat
    #_tag :any
    #_opts [:map
            [:lib/expression-name [:string {:decode/normalize common/normalize-string-key}]]]
    #_args [:* :any]]])

;;; the `:expressions` definition map as found as a top-level key in an MBQL stage
(mr/def ::expressions
  [:sequential {:min 1} [:ref ::expression.definition]])
