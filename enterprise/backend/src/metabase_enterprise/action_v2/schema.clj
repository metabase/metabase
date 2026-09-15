(ns metabase-enterprise.action-v2.schema
  "Malli schemas for the action-v2 module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::undo.row-pk
  "The `:row_pk` column of a Undo, decoded: a warehouse table's primary-key columns, whose keys and values that table owns."
  [:map {:closed false, ::mr/deliberately-open true}])

(mr/def ::undo.raw-before
  "The `:raw_before` column of a Undo, decoded: a warehouse table row, whose keys and values that table owns."
  [:map {:closed false, ::mr/deliberately-open true}])

(mr/def ::undo.raw-after
  "The `:raw_after` column of a Undo, decoded: a warehouse table row, whose keys and values that table owns."
  [:map {:closed false, ::mr/deliberately-open true}])

(mr/def ::undo
  "A Undo as selected from the app DB: every column of `:data_edit_undo_chain`."
  [:merge
   ::undo.update
   [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/action_v2/schema.clj:24"}
    [:id         ms/PositiveInt]]])

(mr/def ::action-mapping
  "A `:mapping` produced by `default-mapping`: which table the action targets and where the row data plugs in."
  [:map {:closed true}
   [:table-id {:optional true} ::lib.schema.id/table]
   [:row      :keyword]])

(mr/def ::action-expression
  "The internal representation used by our APIs, after we've parsed the relevant ids and fetched their configuration."
  ;; Expected extensions:
  ;; - data app actions (with their mappings)
  ;; - action expressions (e.g., unsaved data app actions. might not need these with auto save)
  ;; - dashboard buttons (unless we deprecate them instead)
  [:or
   [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/action_v2/schema.clj:40"}
    [:model-action-id ms/PositiveInt]]
   [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/action_v2/schema.clj:42"}
    [:action-kw :keyword]
    [:mapping [:maybe ::action-mapping]]]])

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
