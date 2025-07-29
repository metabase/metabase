(ns metabase.lib.schema.expression.window
  (:require
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

(mr/def ::offset.n
  [:and {:error/message "offset cannot be zero"}
   :int
   [:not [:= 0]]])

;;; added 0.50.0
(mbql-clause/define-tuple-mbql-clause :offset
  #_expr [:ref ::expression/expression]
  #_n    ::offset.n)

(defmethod expression/type-of-method :offset
  [[_tag _opts expr _n]]
  (expression/type-of expr))
