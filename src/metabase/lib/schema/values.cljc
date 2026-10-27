(ns metabase.lib.schema.values
  "A stage of literal rows, which reads nothing:

    {:lib/type :mbql.stage/mbql
     :name     \"steps\"
     :values   {:columns [{:name \"step\" :base-type :type/Integer} {:name \"label\" :base-type :type/Text}]
                :rows    [[1 \"1. Viewed pricing\"] [2 \"2. Started trial\"]]}}

  `:values` is the stage's source, in place of `:source-table`, `:source-card` or the stage it reads. The stage's own
  clauses apply on top of the rows, as they do on a table."
  (:refer-clojure :exclude [some])
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.types.core]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some]]))

(comment metabase.types.core/keep-me)

(mr/def ::column
  [:map
   {:closed true, :decode/normalize common/normalize-map}
   [:name      ::common/non-blank-string]
   [:base-type ::common/base-type]])

(mr/def ::literal
  [:maybe [:or number? :string :boolean]])

(defn- literal-fits-type?
  "Whether `value` can be a value of `base-type`. Loose: numbers for numeric types, strings for text and temporal types
  (an ISO-8601 string), booleans for booleans, `nil` for anything, and anything for a type outside those families."
  [base-type value]
  (cond
    (nil? value)                       true
    (isa? base-type :type/Number)      (number? value)
    (isa? base-type :type/Boolean)     (boolean? value)
    (isa? base-type :type/Text)        (string? value)
    (isa? base-type :type/Temporal)    (string? value)
    :else                              true))

(defn- values-error
  "An error message if a row has the wrong number of values, or a value that doesn't fit its column's type."
  [{:keys [columns rows]}]
  (or (when-not (apply distinct? (map :name columns))
        "Values columns must have unique names")
      (some (fn [[i row]]
              (if (not= (count row) (count columns))
                (str "Row " i " has " (count row) " values for " (count columns) " columns")
                (some (fn [[{column-name :name, base-type :base-type} value]]
                        (when-not (literal-fits-type? base-type value)
                          (str "Row " i ": " (pr-str value) " is not a " base-type " for column " (pr-str column-name))))
                      (map vector columns row))))
            (map-indexed vector rows))))

(mr/def ::values
  [:and
   [:map
    {:closed true, :decode/normalize common/normalize-map}
    [:columns [:sequential {:min 1} [:ref ::column]]]
    [:rows    [:sequential {:min 1} [:sequential [:ref ::literal]]]]]
   [:fn
    {:error/message "Each row has one value per column, of the column's type"
     :error/fn      (fn [{values :value} _]
                      (values-error values))}
    (complement #'values-error)]])
