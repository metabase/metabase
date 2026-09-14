(ns metabase.secrets.schema
  "Malli schemas for the secrets module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::secret
  "A Secret as selected from the app DB: every column of `:secret`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:version    :int]
   [:creator_id [:maybe ::lib.schema.id/user]]
   [:created_at ms/TemporalInstant]
   [:updated_at [:maybe ms/TemporalInstant]]
   [:name       :string]
   [:kind       [:or :keyword :string]]
   [:source     [:maybe [:or :keyword :string]]]
   [:value      [:or bytes? :string]]])

(mr/def ::secret.update
  "What an update (or insert) of a Secret accepts: every column of `:secret` except `id`, all optional."
  [:map {:closed true}
   [:version    {:optional true} [:maybe :int]]
   [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:name       {:optional true} [:maybe :string]]
   [:kind       {:optional true} [:maybe [:or :keyword :string]]]
   [:source     {:optional true} [:maybe [:or :keyword :string]]]
   [:value      {:optional true} [:maybe [:or bytes? :string]]]])
