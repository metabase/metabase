(ns metabase.lib.schema.info
  "This stuff is used for informational purposes, primarily to record QueryExecution entries when a query is ran. Pass
  them along if applicable when writing code that creates queries, but when working on middleware and the like you can
  most likely ignore this stuff entirely."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

;;; Schema for `info.context`; used for informational purposes to record how a query was executed.
(mr/def ::context
  [:enum
   ;; do not decode, since this should not get written to the app DB or come in from the REST API.
   {:decode/normalize identity}
   :action
   :ad-hoc
   :collection
   :map-tiles
   :pulse
   :dashboard-subscription
   :dashboard
   :question
   :csv-download
   :xlsx-download
   :json-download
   :public-dashboard
   :public-question
   :embedded-dashboard
   :embedded-question
   :embedded-csv-download
   :embedded-xlsx-download
   :embedded-json-download])

(mr/def ::hash
  #?(:clj bytes?
     :cljs :any))

;;; Schema for query `:info` dictionary, which is used for informational purposes to record information about how a
;;; query was executed in QueryExecution and other places. It is considered bad form for middleware to change its
;;; behavior based on this information, don't do it!
;;;
;;; TODO - this schema is somewhat misleading because if you use a function
;;; like [[metabase.query-processor/userland-query]] some of these keys (e.g. `:context`) are in fact required
(mr/def ::info
  [:map
   ;; do not decode, since this should not get written to the app DB or come in from the REST API.
   {:decode/normalize identity}
   ;; TODO -- not 100% sure info should be getting normalized, because we're not supposed to be saving this map
   ;; anyway, right?
   ;; These keys are nice to pass in if you're running queries on the backend and you know these values. They aren't
   ;; used for permissions checking or anything like that so don't try to be sneaky
   [:context                 {:optional true} [:maybe [:ref ::context]]]
   [:executed-by             {:optional true} [:maybe ::lib.schema.id/user]]
   [:action-id               {:optional true} [:maybe ::lib.schema.id/action]]
   [:card-id                 {:optional true} [:maybe ::lib.schema.id/card]]
   [:card-name               {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:dashboard-id            {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:alias/escaped->original {:optional true} [:maybe [:map-of :any :any]]]
   [:pulse-id                {:optional true} [:maybe ::lib.schema.id/pulse]]
   ;; Metadata for datasets when querying the dataset. This ensures that user edits to dataset metadata are blended in
   ;; with runtime computed metadata so that edits are saved.
   [:metadata/model-metadata {:optional true} [:maybe [:sequential [:map-of :any :any]]]]
   ;; Pivot QP runs multiple queries, and in the dataset api, we need to have access to the original query
   ;; so that we can pass it to the pivot.qp for downloads on unsaved questions
   [:pivot/original-query    {:optional true} [:maybe [:map-of :any :any]]]
   ;; `:hash` gets added automatically for userland queries (see [[metabase.query-processor/userland-query]]), so
   ;; don't try passing these in yourself. In fact, I would like this a lot better if we could take these keys xout of
   ;; `:info` entirely and have the code that saves QueryExceutions figure out their values when it goes to save them
   [:query-hash              {:optional true} [:maybe [:ref ::hash]]]])
