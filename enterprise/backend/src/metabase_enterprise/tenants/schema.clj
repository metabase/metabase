(ns metabase-enterprise.tenants.schema
  "Malli schemas for the tenants module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::tenant.attributes
  "The `:attributes` column of a Tenant, decoded."
  [:map-of :string [:maybe [:or :string number? :boolean]]])

(mr/def ::tenant
  "A Tenant as selected from the app DB: every column of `:tenant`."
  [:merge
   ::tenant.columns
   [:map {:closed true}
    [:id                   ms/PositiveInt]]])

(mr/def ::tenant.columns
  "Every column of `:tenant` except `id`, all optional."
  [:map {:closed true}
   [:name                 {:optional true} [:maybe :string]]
   [:slug                 {:optional true} [:maybe :string]]
   [:is_active            {:optional true} [:maybe :boolean]]
   [:updated_at           {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:created_at           {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:attributes           {:optional true} [:maybe ::tenant.attributes]]
   [:tenant_collection_id {:optional true} [:maybe ::lib.schema.id/collection]]])

(mr/def ::tenant.create
  "What an insert of a Tenant accepts."
  (mut/select-keys (mr/schema ::tenant.columns) [:name :slug :attributes]))

(mr/def ::tenant.update
  "What an update of a Tenant accepts: excludes the immutable `:created_at`, `:slug` and `:tenant_collection_id`."
  (mut/select-keys (mr/schema ::tenant.columns) [:name :is_active :updated_at :attributes]))

(mr/def ::tenant.partial
  "A Tenant row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::tenant [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::tenant.column
  "A column of `:tenant`, for the `:columns` option of the queries in [[metabase-enterprise.tenants.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::tenant.columns))))
