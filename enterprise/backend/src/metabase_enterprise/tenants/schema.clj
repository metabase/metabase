(ns metabase-enterprise.tenants.schema
  "Malli schemas for the tenants module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::tenant.attributes
  "The `:attributes` column of a Tenant, decoded."
  [:map-of :string [:maybe [:or :string number? :boolean]]])

(mr/def ::tenant
  "A Tenant as selected from the app DB: every column of `:tenant`."
  [:merge
   ::tenant.update
   [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/tenants/schema.clj:16"}
    [:id                   ms/PositiveInt]]])

(mr/def ::tenant.update
  "What an update (or insert) of a Tenant accepts: every column of `:tenant` except `id`, all optional."
  [:map {:closed true}
   [:name                 {:optional true} [:maybe :string]]
   [:slug                 {:optional true} [:maybe :string]]
   [:is_active            {:optional true} [:maybe :boolean]]
   [:updated_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:attributes           {:optional true} [:maybe ::tenant.attributes]]
   [:tenant_collection_id {:optional true} [:maybe ::lib.schema.id/collection]]])
