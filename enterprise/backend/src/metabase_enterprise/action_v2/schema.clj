(ns metabase-enterprise.action-v2.schema
  "Malli schemas for the action-v2 module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::undo.row-pk
  "The `:row_pk` column of a Undo, decoded."
  :map)

(mr/def ::undo.raw-before
  "The `:raw_before` column of a Undo, decoded."
  :map)

(mr/def ::undo.raw-after
  "The `:raw_after` column of a Undo, decoded."
  :map)

(mr/def ::undo
  "A Undo as selected from the app DB: every column of `:data_edit_undo_chain`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:batch_num  :int]
   [:table_id   ::lib.schema.id/table]
   [:row_pk     ::undo.row-pk]
   [:user_id    ::lib.schema.id/user]
   [:scope      [:or :keyword :string]]
   [:undoable   :boolean]
   [:raw_before [:maybe ::undo.raw-before]]
   [:raw_after  [:maybe ::undo.raw-after]]
   [:undone     :boolean]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]])

(mr/def ::undo.update
  "What an update (or insert) of a Undo accepts: every column of `:data_edit_undo_chain` except `id`, all optional."
  [:map {:closed true}
   [:batch_num  {:optional true} [:maybe :int]]
   [:table_id   {:optional true} [:maybe ::lib.schema.id/table]]
   [:row_pk     {:optional true} [:maybe ::undo.row-pk]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:scope      {:optional true} [:maybe [:or :keyword :string]]]
   [:undoable   {:optional true} [:maybe :boolean]]
   [:raw_before {:optional true} [:maybe ::undo.raw-before]]
   [:raw_after  {:optional true} [:maybe ::undo.raw-after]]
   [:undone     {:optional true} [:maybe :boolean]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]])
