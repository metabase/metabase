(ns metabase.lib.schema.order-by
  "Schemas for order-by clauses."
  (:require
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::direction
  [:enum :asc :desc])

(mbql-clause/define-tuple-mbql-clause :asc
  [:ref ::expression/orderable])

(mbql-clause/define-tuple-mbql-clause :desc
  [:ref ::expression/orderable])

(mr/def ::order-by
  [:and
   [:ref ::mbql-clause/clause]
   [:fn
    {:error/message ":asc or :desc clause"}
    (every-pred
     vector?
     (fn [[tag]]
       (#{:asc :desc} tag)))]])

(mu/defn distinct-order-bys?
  "Are all order by clauses considered distinct?"
  [order-bys :- [:sequential {:min 1} [:ref ::order-by]]]
  (lib.schema.util/distinct-refs?
   (for [[_tag _opts expr] order-bys]
     expr)))

(mr/def ::order-bys
  [:and
   [:sequential {:min 1} [:ref ::order-by]]
   [:fn
    {:error/message "Order bys must be distinct"}
    #'distinct-order-bys?]])
