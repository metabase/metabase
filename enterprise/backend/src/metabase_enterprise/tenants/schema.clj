(ns metabase-enterprise.tenants.schema
  "Malli schemas for the tenants module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::tenant
  "A Tenant as selected from the app DB: every column of `:tenant`."
  [:map {:closed true}
   [:id                   ms/PositiveInt]
   [:name                 :string]
   [:slug                 :string]
   [:is_active            :boolean]
   [:updated_at           ms/TemporalInstant]
   [:created_at           ms/TemporalInstant]
   [:attributes           [:maybe [:or :string :map sequential?]]]
   [:tenant_collection_id ::lib.schema.id/collection]])

(mr/def ::tenant.update
  "What an update (or insert) of a Tenant accepts: every column of `:tenant` except `id`, all optional."
  [:map {:closed true}
   [:name                 {:optional true} [:maybe :string]]
   [:slug                 {:optional true} [:maybe :string]]
   [:is_active            {:optional true} [:maybe :boolean]]
   [:updated_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:attributes           {:optional true} [:maybe [:or :string :map sequential?]]]
   [:tenant_collection_id {:optional true} [:maybe ::lib.schema.id/collection]]])
