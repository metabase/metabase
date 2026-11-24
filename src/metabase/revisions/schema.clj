(ns metabase.revisions.schema
  "Malli schemas for the revisions module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::revision.object
  "The `:object` column of a Revision, decoded."
  :map)

(mr/def ::revision.update
  "A Revision by its `id` with the columns to change, each optional."
  [:map {:closed true}
   [:id               ms/PositiveInt]
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

(mr/def ::revision.create
  "What a caller gives to create a Revision: the columns of an update without the `:id` and the columns set when a
  Revision is stored, the entity it records, its editor, and the stored state of the entity."
  [:merge
   (reduce mut/dissoc ::revision.update [:id :timestamp :most_recent :metabase_version])
   [:map {:closed true}
    [:model        :string]
    [:model_id     ms/PositiveInt]
    [:user_id      ::lib.schema.id/user]
    [:object       ::revision.object]
    [:is_creation  :boolean]
    [:is_reversion :boolean]]])

(mr/def ::revision
  "A Revision as selected from the app DB: every column of `:revision`."
  ::revision.update)

;; these are all maybes as sometimes revisions don't exist, or users might be missing the names, etc
(mr/def ::last-edit-info
  "Schema of the `:last-edit-info` map. A subset of a user with a timestamp indicating when the last edit was."
  [:map
   [:timestamp  [:maybe :any]]
   [:id         [:maybe ms/PositiveInt]]
   [:first_name [:maybe :string]]
   [:last_name  [:maybe :string]]
   [:email      [:maybe :string]]])

(mr/def ::maybe-annotated
  "Spec for an item annotated with last-edit-info. Items are cards or dashboards. Optional because we may not always
  have revision history for all cards/dashboards."
  [:map
   [:last-edit-info {:optional true} ::last-edit-info]])
