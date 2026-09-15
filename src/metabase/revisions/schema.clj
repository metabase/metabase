(ns metabase.revisions.schema
  "Malli schemas for the revisions module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::revision.object
  "The `:object` column of a Revision, decoded."
  :map)

(mr/def ::revision
  "A Revision as selected from the app DB: every column of `:revision`."
  [:merge
   ::revision.update
   [:map {:closed true, :probe/id "src/metabase/revisions/schema.clj:16"}
    [:id               ms/PositiveInt]]])

(mr/def ::revision.update
  "What an update (or insert) of a Revision accepts: every column of `:revision` except `id`, all optional."
  [:map {:closed true}
   [:model            {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id         {:optional true} [:maybe :int]]
   [:user_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:timestamp        {:optional true} [:maybe ms/TemporalInstant]]
   [:object           {:optional true} [:maybe ::revision.object]]
   [:is_reversion     {:optional true} [:maybe :boolean]]
   [:is_creation      {:optional true} [:maybe :boolean]]
   [:message          {:optional true} [:maybe :string]]
   [:most_recent      {:optional true} [:maybe :boolean]]
   [:metabase_version {:optional true} [:maybe :string]]])
