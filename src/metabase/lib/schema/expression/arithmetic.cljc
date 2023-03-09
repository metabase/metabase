(ns metabase.lib.schema.expression.arithmetic
  "Arithmetic expressions like `:+`."
  (:require
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.types :as types]))

(mbql-clause/define-catn-mbql-clause :*
  [:args [:repeat {:min 2} [:schema [:ref ::expression/number]]]])

(defmethod expression/type-of* :*
  [[_tag _opts & args]]
  #_{:clj-kondo/ignore [:reduce-without-init]}
  (reduce types/most-specific-common-ancestor (map expression/type-of args)))
