(ns metabase.query-processor.schema
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;; this schema is not very strict because we need to handle different types of queries (legacy MBQL, pMBQL, super-legacy
;; MBQL, internal audit app queries, etc.) and it might not be normalized yet.
(mr/def ::query
  [:and
   :map
   [:fn
    {:error/message "Query with a :type or :lib/type key"}
    (some-fn :type :lib/type)]])

(mr/def ::metadata.col
  [:map
   [:name :string]
   ;; TODO -- in practice these keys should always be present but it seems like it's missing in some of our tests. We
   ;; should make these required and then go fix the tests.
   [:base_type     {:optional true} ::lib.schema.common/base-type]
   [:database_type {:optional true} :string]])

;; TODO -- in practice `metadata` should always be non-nil and have `:cols` but it seems like it's missing in some of
;; our tests. We should make these required and then go fix the tests.
(mr/def ::metadata
  [:maybe
   [:map
    [:cols {:optional true} [:sequential ::metadata.col]]]])

(mr/def ::rf
  [:and
   ;; apparently the `:function` schema below just checks for an [[ifn?]], which is not quite what we want, since a map
   ;; is an `ifn?`. Thus we will check both regular [[fn?]] and the `:function` schema.
   fn?
   [:function
    ;; init arity
    [:=> [:cat]           :any]
    ;; completing arity. Has to return SOMETHING
    [:=> [:cat :any]      :some]
    ;; each row arity
    [:=> [:cat :any :any] :any]]])

(mr/def ::rff
  [:and
   ;; apparently the `:function` schema below just checks for an [[ifn?]], which is not quite what we want, since a map
   ;; is an `ifn?`. Thus we will check both regular [[fn?]] and the `:function` schema.
   fn?
   [:=>
    [:cat ::metadata]
    ::rf]])

(mr/def ::qp
  [:=>
   [:cat ::query ::rff]
   :some])

(mr/def ::export-format
  "One of `:api` (for normal JSON API responses), `:json`, `:csv`, or `:xlsx` (for downloads)."
  [:enum :api :json :csv :xlsx])

(mr/def ::reducible-rows
  [:or
   sequential?
   (lib.schema.common/instance-of-class clojure.lang.IReduceInit)])

(mr/def ::respond
  "Schema for the `respond` function passed around to things like [[metabase.driver/execute-reducible-query]]
  or [[metabase.query-processor.pipeline/*execute*]]."
  [:=> [:cat ::metadata ::reducible-rows] :some])
