(ns metabase.revisions.schema
  "Malli schemas for the revisions module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::revision
  "A Revision as selected from the app DB: every column of `:revision`."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:model            [:or :keyword :string]]
   [:model_id         [:maybe :int]]
   [:user_id          ::lib.schema.id/user]
   [:timestamp        ms/TemporalInstant]
   [:object           [:or :string :map sequential?]]
   [:is_reversion     :boolean]
   [:is_creation      :boolean]
   [:message          [:maybe [:or :string :map sequential?]]]
   [:most_recent      :boolean]
   [:metabase_version [:maybe :string]]])

(mr/def ::revision.update
  "What an update (or insert) of a Revision accepts: every column of `:revision` except `id`, all optional."
  [:map {:closed true}
   [:model            {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id         {:optional true} [:maybe :int]]
   [:user_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:timestamp        {:optional true} [:maybe ms/TemporalInstant]]
   [:object           {:optional true} [:maybe [:or :string :map sequential?]]]
   [:is_reversion     {:optional true} [:maybe :boolean]]
   [:is_creation      {:optional true} [:maybe :boolean]]
   [:message          {:optional true} [:maybe [:or :string :map sequential?]]]
   [:most_recent      {:optional true} [:maybe :boolean]]
   [:metabase_version {:optional true} [:maybe :string]]])
