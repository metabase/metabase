(ns metabase.lib.schema.order-by
  "Schemas for order-by clauses."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]))

(mr/def ::direction
  [:enum :asc :desc])

(mr/def ::asc
  [:catn
   [:direction [:= :asc]]
   [:options ::common/options]
   [:expression ::expression/orderable]])

(mr/def ::desc
  [:catn
   [:direction [:= :desc]]
   [:options ::common/options]
   [:expression ::expression/orderable]])

(mr/def ::order-by
  [:or
   ::asc
   ::desc])

;;; TODO -- should there be a no-duplicates constraint here?
(mr/def ::order-bys
  [:sequential ::order-by])
