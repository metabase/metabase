(ns metabase.actions.error
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]))

(def violate-unique-constraint
  "Error type for SQL unique constraint violation."
  ::violate-unique-constraint)

(def violate-not-null-constraint
  "Error type for SQL not null constraint violation."
  ::violate-not-null-constraint)

(def violate-foreign-key-constraint
  "Error type for SQL foreign key constraint violation."
  ::violate-foreign-key-constraint)

(def incorrect-value-type
  "Error type for SQL incorrect value type."
  ::incorrect-value-type)

(def incorrect-affected-rows
  "Error type for when the number of affected rows is different wiih what we expect."
  ::incorrect-affected-rows)

(defmulti ->error-info
  "Converts an error info into a map with :message and :errors keys.

  - :message is used as the API error message
  - :errors  is a map from column->error message, this is used on FE to show per column error."
  :type)

(defn- columns->name
  [columns]
  (if (sequential? columns)
    (str/join ", " columns)
    columns))

(defmethod ->error-info violate-unique-constraint
  [{:keys [columns] :as _e-data}]
  {:message (tru "Value for column(s) {0} is duplicated" (columns->name columns))
   :errors  (reduce (fn [acc col]
                      (assoc acc col (tru "value for column {0} is duplicated" col)))
                    {}
                    columns)})

(defmethod ->error-info violate-not-null-constraint
  [{:keys [columns] :as _e-data}]
  {:message (tru "Value for column(s) {0} must be not null" (columns->name columns))
   :errors  (reduce (fn [acc col]
                      (assoc acc col (tru "value for column {0} must be not null" col)))
                    {}
                    columns)})

(defmethod ->error-info violate-foreign-key-constraint
  [{:keys [columns expected-type] :as _e-data}]
  {:message (tru "Value for column(s) {0} should be of type {1}" (columns->name columns) expected-type)
   :errors  (reduce (fn [acc col]
                      (assoc acc col (tru "value for column {0} should be of type {1}" (columns->name columns) expected-type)))
                    {}
                    columns)})

(defmethod ->error-info incorrect-affected-rows
  [{:keys [action-type number-affected] :as _e-data}]
  {:message (case action-type
             :row/delete (if (zero? number-affected)
                           (tru "Sorry, the row you''re trying to delete doesn''t exist")
                           (tru "Sorry, this would delete {0} rows, but you can only act on 1" number-affected))
             :row/update (if (zero? number-affected)
                           (tru "Sorry, the row you''re trying to update doesn''t exist")
                           (tru "Sorry, this would update {0} rows, but you can only act on 1" number-affected)))
   :errors  {}})
