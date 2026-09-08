(ns metabase.audit-app.schema
  "Malli schemas for the audit-app module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::audit-log
  "A AuditLog as selected from the app DB: every column of `:audit_log`."
  [:map {:closed true}
   [:id            ms/PositiveInt]
   [:topic         [:or :keyword :string]]
   [:timestamp     ms/TemporalInstant]
   [:end_timestamp [:maybe ms/TemporalInstant]]
   [:user_id       [:maybe ::lib.schema.id/user]]
   [:model         [:maybe [:or :keyword :string]]]
   [:model_id      [:maybe :int]]
   [:details       [:or :string :map sequential?]]])

(mr/def ::audit-log.update
  "What an update (or insert) of a AuditLog accepts: every column of `:audit_log` except `id`, all optional."
  [:map {:closed true}
   [:topic         {:optional true} [:maybe [:or :keyword :string]]]
   [:timestamp     {:optional true} [:maybe ms/TemporalInstant]]
   [:end_timestamp {:optional true} [:maybe ms/TemporalInstant]]
   [:user_id       {:optional true} [:maybe ::lib.schema.id/user]]
   [:model         {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id      {:optional true} [:maybe :int]]
   [:details       {:optional true} [:maybe [:or :string :map sequential?]]]])
