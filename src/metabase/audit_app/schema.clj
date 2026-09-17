(ns metabase.audit-app.schema
  "Malli schemas for the audit-app module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::audit-log.details
  "The `:details` column of an AuditLog, decoded."
  ms/OpaqueJSONColumn)

(mr/def ::audit-log
  "A AuditLog as selected from the app DB: every column of `:audit_log`."
  [:merge
   ::audit-log.columns
   [:map {:closed true}
    [:id            ms/PositiveInt]]])

(mr/def ::audit-log.columns
  "Every column of `:audit_log` except `id`, all optional."
  [:map {:closed true}
   [:topic         {:optional true} [:maybe [:or :keyword :string]]]
   [:timestamp     {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:end_timestamp {:optional true} [:maybe ms/TemporalInstant]]
   [:user_id       {:optional true} [:maybe ::lib.schema.id/user]]
   [:model         {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id      {:optional true} [:maybe :int]]
   [:details       {:optional true} [:maybe ::audit-log.details]]])

(mr/def ::audit-log.create
  "What an insert of a AuditLog accepts: every column of `:audit_log` except `id`, all optional."
  ::audit-log.columns)

(mr/def ::audit-log.partial
  "A AuditLog row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::audit-log [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::audit-log.column
  "A column of `audit_log`, for the `:columns` option of the queries in [[metabase.audit-app.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::audit-log.columns))))
