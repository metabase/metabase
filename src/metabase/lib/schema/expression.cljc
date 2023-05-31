(ns metabase.lib.schema.expression
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.common :as common]
   [metabase.shared.util.i18n :as i18n]
   [metabase.types]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  #?(:cljs (:require-macros [metabase.lib.schema.expression])))

(comment metabase.types/keep-me)

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

(defn- mbql-clause? [expr]
  (and (vector? expr)
       (keyword? (first expr))))

(mr/def ::base-type
  [:or
   [:= ::type.unknown]
   ::common/base-type])

(mu/defn type-of :- [:or
                     ::base-type
                     [:set {:min 2} ::base-type]]
  "Determine the type of an MBQL expression. Returns either a type keyword, or if the type is ambiguous, a set of
  possible types."
  [expr]
  (or
   ;; for MBQL clauses with `:effective-type` or `:base-type` in their options: ignore their dumb [[type-of-method]] methods
   ;; and return that type directly. Ignore everything else! Life hack!
   (and (mbql-clause? expr)
        (map? (second expr))
        (or (:effective-type (second expr))
            (:base-type (second expr))))
   (type-of-method expr)))

(defmethod type-of-method :default
  [expr]
  (throw (ex-info (i18n/tru "Don''t know how to determine the type of {0}" (pr-str expr))
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

(defn- expression-schema
  "Schema that matches the following rules:

  1a. expression is *not* an MBQL clause, OR

  1b. expression is an registered MBQL clause and matches the schema registered
      with [[metabase.lib.schema.mbql-clause]], AND

  2. expression's [[type-of]] isa? `base-type`"
  [base-type description]
  [:and
   [:or
    [:fn
     {:error/message "valid MBQL clause"
      :error/fn      (fn [{:keys [value]} _]
                       (str "invalid MBQL clause: " (pr-str value)))}
     (complement mbql-clause?)]
    [:ref :metabase.lib.schema.mbql-clause/clause]]
   [:fn
    {:error/message description}
    #(type-of? % base-type)]])

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
  #{:type/Text :type/Number :type/Temporal})

(mr/def ::orderable
  (expression-schema orderable-types
                     "an expression that can be compared with :> or :<"))

(def equality-comparable-types
  "Set of base types that can be campared with equality."
   #{:type/Boolean :type/Text :type/Number :type/Temporal})

(mr/def ::equality-comparable
  [:maybe
   (expression-schema equality-comparable-types
                      "an expression that can appear in := or :!=")])

;;; any type of expression.
(mr/def ::expression
  [:maybe (expression-schema :type/* "any type of expression")])

;;; the `:expressions` definition map as found as a top-level key in an MBQL stage
(mr/def ::expressions
  [:map-of
   {:min 1, :error/message ":expressions definition map of expression name -> expression"}
   ::common/non-blank-string
   ::expression])
