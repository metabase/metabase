(ns metabase.lib.schema.expression.temporal
  (:require
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]))

;;; TODO -- we should constrain this so that you can only use a Date unit if expr is a date, etc.
(mbql-clause/define-tuple-mbql-clause :datetime-add
  #_expr   [:ref ::expression/temporal]
  #_amount :int
  #_unit   [:ref ::temporal-bucketing/unit.date-time.interval])

(defmethod expression/type-of* :datetime-add
  [[_tag _opts expr _amount _unit]]
  (expression/type-of expr))
