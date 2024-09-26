(ns metabase.lib.schema.order-by
  "Schemas for order-by clauses."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.util.malli.registry :as mr]))

(mr/def ::direction
  [:enum {:decode/normalize common/normalize-keyword} :asc :desc])

(mbql-clause/define-tuple-mbql-clause :asc
  [:ref ::expression/orderable])

(mbql-clause/define-tuple-mbql-clause :desc
  [:ref ::expression/orderable])

(mr/def ::order-by
  [:multi
   {:dispatch common/mbql-clause-tag}
   [:asc  :mbql.clause/asc]
   [:desc :mbql.clause/desc]])

(mr/def ::order-bys
  (lib.schema.util/distinct-ignoring-uuids [:sequential {:min 1} [:ref ::order-by]]))
