(ns metabase-enterprise.tenants.schema
  "Malli schemas for the tenants module."
  (:require
   [clojure.string :as str]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::tenant.name
  "The `:name` of a Tenant: a non-blank string."
  ms/NonBlankString)

(mr/def ::tenant.slug
  (mu/with-api-error-message
   [:re #"^[-_a-z0-9]{1,255}$"]
   (deferred-tru "invalid slug")))

(mr/def ::tenant.attributes
  (mu/with-api-error-message
   [:and
    (ms/string-keyed-map [:ref ::lib.schema.parameter/parameter.value])
    [:fn (fn [m] (not-any? #(str/starts-with? (name %) "@") (keys m)))]]
   (deferred-tru "attribute keys must be strings and must not start with `@`.")))

(mr/def ::tenant
  "A Tenant as selected from the app DB: every column of `:tenant`."
  [:merge
   ::tenant.update
   [:map {:closed true}
    [:id                   ms/PositiveInt]]])

(mr/def ::tenant.update
  "What an update (or insert) of a Tenant accepts: every column of `:tenant` except `id`, all optional."
  [:map {:closed true}
   [:name                 {:optional true} ::tenant.name]
   [:slug                 {:optional true} ::tenant.slug]
   [:is_active            {:optional true} [:maybe :boolean]]
   [:updated_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:attributes           {:optional true} [:maybe ::tenant.attributes]]
   [:tenant_collection_id {:optional true} [:maybe ::lib.schema.id/collection]]])
