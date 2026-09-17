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

(mr/def ::revision
  "A Revision as selected from the app DB: every column of `:revision`."
  [:merge
   ::revision.columns
   [:map {:closed true}
    [:id               ms/PositiveInt]]])

(mr/def ::revision.columns
  "Every column of `:revision` except `id`, all optional."
  [:map {:closed true}
   [:model            {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id         {:optional true} [:maybe :int]]
   [:user_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:timestamp        {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:object           {:optional true} [:maybe ::revision.object]]
   [:is_reversion     {:optional true} [:maybe :boolean]]
   [:is_creation      {:optional true} [:maybe :boolean]]
   [:message          {:optional true} [:maybe :string]]
   [:most_recent      {:optional true} [:maybe :boolean]]
   [:metabase_version {:optional true} [:maybe :string]]])

(mr/def ::revision.create
  "What an insert of a Revision accepts."
  (mr/schema ::revision.columns))

(mr/def ::revision.update
  "What an update of a Revision accepts: no immutable columns. A Revision is otherwise an immutable historical
  record — `:model`, `:model_id`, `:user_id`, `:timestamp`, `:object`, `:is_reversion`, `:is_creation`, `:message`,
  and `:metabase_version` are all fixed at creation, and nothing ever changes them afterward."
  (mut/select-keys (mr/schema ::revision.columns) [:most_recent]))

(mr/def ::revision.partial
  "A Revision row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::revision [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::revision.column
  "A column of `:revision`, for the `:columns` option of the queries in [[metabase.revisions.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::revision.columns))))
