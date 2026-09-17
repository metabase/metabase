(ns metabase.secrets.schema
  "Malli schemas for the secrets module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::secret
  "A Secret as selected from the app DB: every column of `:secret`."
  [:merge
   ::secret.columns
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::secret.partial
  "A Secret row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::secret [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::secret.columns
  "Every column of `:secret` except `id`, all optional."
  [:map {:closed true}
   [:version    {:optional true} [:maybe :int]]
   [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:name       {:optional true} [:maybe :string]]
   [:kind       {:optional true} [:maybe [:or :keyword :string]]]
   [:source     {:optional true} [:maybe [:or :keyword :string]]]
   [:value      {:optional true} [:maybe [:or bytes? :string]]]])

(mr/def ::secret.create
  "What an insert of a Secret accepts: every column of `::secret.columns` plus an optional `:id`, since a new version
  of an existing Secret is inserted with the same `:id` as its earlier versions."
  [:merge
   (mut/select-keys (mr/schema ::secret.columns) [:version :creator_id :created_at :updated_at :name :kind :source :value])
   [:map {:closed true}
    [:id {:optional true} ms/PositiveInt]]])

(mr/def ::secret.column
  "A column of `secret`, for the `:columns` option of the queries in [[metabase.secrets.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::secret.columns))))
