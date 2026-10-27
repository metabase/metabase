(ns metabase.lib.schema.expression.dialect
  "Calls to a database's own functions, for what MBQL has no clause for:

    [:dialect-fn {:lib/uuid \"...\", :base-type :type/Integer} \"uniqExact\" <expression> ...]

  `:dialect-aggregation` is the same for an aggregate function. MBQL doesn't know what these functions do, so the
  clause states the type it returns, and the driver decides which function names it accepts and how to write them."
  (:require
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.aggregation :as aggregation]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

(mr/def ::function-name
  [:re {:error/message "a function name: letters, digits and underscores"} #"^[A-Za-z_][A-Za-z0-9_]*$"])

(doseq [tag [:dialect-fn :dialect-aggregation]]
  (mbql-clause/define-mbql-clause tag
    [:and
     (mbql-clause/catn-clause-schema tag
                                     [:function [:schema [:ref ::function-name]]]
                                     [:args [:* [:schema [:ref ::expression/expression]]]])
     [:fn
      {:error/message (str tag " needs the :base-type it returns in its options")}
      #(:base-type (second %))]])
  (defmethod expression/type-of-method tag
    [[_tag opts]]
    (:base-type opts)))

(lib.hierarchy/derive :dialect-aggregation ::aggregation/aggregation-clause-tag)
