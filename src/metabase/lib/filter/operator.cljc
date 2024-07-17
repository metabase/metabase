(ns metabase.lib.filter.operator
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn operator-def :- ::lib.schema.filter/operator
  "Get a filter operator definition for the MBQL filter with `tag`, e.g. `:=`. In some cases various tags have alternate
  display names used for different situations e.g. for numbers vs temporal values; pass in the
  `display-name-style` to choose a non-default display-name."
  ([tag]
   (operator-def tag :default))

  ([tag display-name-style]
   {:lib/type             :operator/filter
    :short                tag
    :display-name-variant display-name-style}))

(def ^:private numeric-key-operators
  [(operator-def :=)
   (operator-def :!=)
   (operator-def :>)
   (operator-def :<)
   (operator-def :between)
   (operator-def :>=)
   (operator-def :<=)
   (operator-def :is-null :is-empty)
   (operator-def :not-null :not-empty)])

(def ^:private temporal-operators
  [(operator-def :!= :excludes)
   (operator-def :=)
   (operator-def :< :before)
   (operator-def :> :after)
   (operator-def :between)
   (operator-def :is-null :is-empty)
   (operator-def :not-null :not-empty)])

(def ^:private coordinate-operators
  [(operator-def :=)
   (operator-def :!=)
   (operator-def :inside)
   (operator-def :>)
   (operator-def :<)
   (operator-def :between)
   (operator-def :>=)
   (operator-def :<=)])

(def ^:private number-operators
  [(operator-def := :equal-to)
   (operator-def :!= :not-equal-to)
   (operator-def :>)
   (operator-def :<)
   (operator-def :between)
   (operator-def :>=)
   (operator-def :<=)
   (operator-def :is-null :is-empty)
   (operator-def :not-null :not-empty)])

(def ^:private text-operators
  [(operator-def :=)
   (operator-def :!=)
   (operator-def :contains)
   (operator-def :does-not-contain)
   (operator-def :is-empty)
   (operator-def :not-empty)
   (operator-def :starts-with)
   (operator-def :ends-with)])

(def ^:private text-like-operators
  [(operator-def :=)
   (operator-def :!=)
   (operator-def :is-empty)
   (operator-def :not-empty)])

(def ^:private boolean-operators
  [(operator-def :=)
   (operator-def :is-null :is-empty)
   (operator-def :not-null :not-empty)])

(def ^:private default-operators
  [(operator-def :is-null :is-empty)
   (operator-def :not-null :not-empty)])

(def join-operators
  "Operators that should be listed as options in join conditions."
  [(assoc (operator-def :=) :default true)
   (operator-def :>)
   (operator-def :<)
   (operator-def :>=)
   (operator-def :<=)
   (operator-def :!=)])

(mu/defn filter-operators :- [:sequential ::lib.schema.filter/operator]
  "The list of available filter operators.
   The order of operators is relevant for the front end.
   There are slight differences between names and ordering for the different base types."
  [column :- ::lib.schema.metadata/column]
  ;; The order of these clauses is important since we want to match the most relevant type
  ;; the order is different than `lib.types.isa/field-type` as filters need to operate
  ;; on the effective-type rather than the semantic-type, eg boolean and number cannot become
  ;; string if semantic type is type/Category
  (condp lib.types.isa/field-type? column
    :metabase.lib.types.constants/temporal    temporal-operators
    :metabase.lib.types.constants/coordinate  coordinate-operators
    :metabase.lib.types.constants/number      (if ((some-fn lib.types.isa/primary-key? lib.types.isa/foreign-key?) column)
                                                numeric-key-operators
                                                number-operators)
    :metabase.lib.types.constants/boolean     boolean-operators
    :metabase.lib.types.constants/string      text-operators
    :metabase.lib.types.constants/string_like text-like-operators
    ;; default
    default-operators))

(mu/defn ^:private filter-operator-long-display-name :- ::lib.schema.common/non-blank-string
  [tag                  :- :keyword
   display-name-variant :- :keyword]
  (case tag
    :=                (case display-name-variant
                        :equal-to (i18n/tru "Equal to")
                        :default  (i18n/tru "Is"))
    :!=               (case display-name-variant
                        :not-equal-to (i18n/tru "Not equal to")
                        :excludes     (i18n/tru "Excludes")
                        :default      (i18n/tru "Is not"))
    :>                (case display-name-variant
                        :after   (i18n/tru "After")
                        :default (i18n/tru "Greater than"))
    :<                (case display-name-variant
                        :before  (i18n/tru "Before")
                        :default (i18n/tru "Less than"))
    :>=               (case display-name-variant
                        :default (i18n/tru "Greater than or equal to"))
    :<=               (case display-name-variant
                        :default (i18n/tru "Less than or equal to"))
    :between          (case display-name-variant
                        :default (i18n/tru "Between"))
    :is-null          (case display-name-variant
                        :is-empty (i18n/tru "Is empty")
                        :default  (i18n/tru "Is null"))
    :not-null         (case display-name-variant
                        :not-empty (i18n/tru "Not empty")
                        :default   (i18n/tru "Not null"))
    :is-empty         (case display-name-variant
                        :default (i18n/tru "Is empty"))
    :not-empty        (case display-name-variant
                        :default (i18n/tru "Not empty"))
    :contains         (case display-name-variant
                        :default (i18n/tru "Contains"))
    :does-not-contain (case display-name-variant
                        :default (i18n/tru "Does not contain"))
    :starts-with      (case display-name-variant
                        :default (i18n/tru "Starts with"))
    :ends-with        (case display-name-variant
                        :default (i18n/tru "Ends with"))
    :inside           (case display-name-variant
                        :default (i18n/tru "Inside"))))

(mu/defn ^:private filter-operator-display-name :- ::lib.schema.common/non-blank-string
  [tag                  :- :keyword
   display-name-variant :- :keyword]
  (case tag
    :=  "="
    :!= "≠"
    :>  ">"
    :<  "<"
    :>= "≥"
    :<= "≤"
    (filter-operator-long-display-name tag display-name-variant)))

(defmethod lib.metadata.calculation/display-name-method :operator/filter
  [_query _stage-number {short-name :short, :keys [display-name-variant]} display-name-style]
  (case display-name-style
    :default (filter-operator-display-name short-name display-name-variant)
    :long    (filter-operator-long-display-name short-name display-name-variant)))

(defmethod lib.metadata.calculation/display-info-method :operator/filter
  [_query _stage-number {short-name :short, :keys [display-name-variant default]}]
  (cond-> {:short-name        (u/qualified-name short-name)
           :display-name      (filter-operator-display-name short-name display-name-variant)
           :long-display-name (filter-operator-long-display-name short-name display-name-variant)}
    default (assoc :default true)))
