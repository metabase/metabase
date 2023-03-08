(ns metabase.lib.schema
  "Malli schema for the `:pipeline` MBQL query type, the version of MBQL produced and manipulated by the new Cljc
  Metabase lib. Currently this is a little different from the version of MBQL consumed by the QP, specified
  in [[metabase.mbql.schema]]. Hopefully these versions will converge in the future.

  Some primitives below are duplicated from [[metabase.util.malli.schema]] since that's not `.cljc`. Other stuff is
  copied from [[metabase.mbql.schema]] so this can exist completely independently; hopefully at some point in the
  future we can deprecate that namespace and eventually do away with it entirely."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.join :as join]
   [metabase.lib.schema.order-by :as order-by]
   [metabase.util.malli.registry :as mr]))

(mr/def ::stage.native
  [:map
   [:lib/type [:= :mbql.stage/native]]
   [:lib/options ::common/options]
   [:native any?]
   [:args {:optional true} [:sequential any?]]])

(mr/def ::stage.mbql
  [:and
   [:map
    [:lib/type [:= :mbql.stage/mbql]]
    [:lib/options ::common/options]
    [:order-by {:optional true} ::order-by/order-bys]
    [:joins {:optional true} ::join/joins]
    [:filter {:optional true} ::expression/boolean]]
   ;; `:source-query` is not allowed in `:pipeline` (pMBQL) queries!
   [:fn (complement #(contains? % :source-query))]])

;;; Schema for an MBQL stage that includes either `:source-table` or `:source-query`.
(mr/def ::stage.mbql.with-source
  [:and
   ::stage.mbql
   [:map
    [:source-table ::id/table]]])

;;; Schema for an MBQL stage that DOES NOT include `:source-table` -- an MBQL stage that is not the initial stage.
(mr/def ::stage.mbql.without-source
  [:and
   ::stage.mbql
   [:fn (complement #(contains? % :source-table))]])

;;; the schemas are constructed this way instead of using `:or` because they give better error messages
(mr/def ::stage.type
  [:enum :mbql.stage/native :mbql.stage/mbql])

(mr/def ::stage
  [:and
   [:map
    [:lib/type ::stage.type]]
   [:multi {:dispatch :lib/type}
    [:mbql.stage/native ::stage.native]
    [:mbql.stage/mbql ::stage.mbql]]])

(mr/def ::stage.initial
  [:and
   [:map
    [:lib/type ::stage.type]]
   [:multi {:dispatch :lib/type}
    [:mbql.stage/native ::stage.native]
    [:mbql.stage/mbql ::stage.mbql.with-source]]])

(mr/def ::stage.additional
  ::stage.mbql.without-source)

(mr/def ::stages
  [:cat
   ::stage.initial
   [:* ::stage.additional]])

(mr/def ::query
  [:map
   [:lib/type [:= :mbql/query]]
   [:database ::id/database]
   [:type [:= :pipeline]]
   [:stages ::stages]])
