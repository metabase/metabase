(ns metabase-enterprise.transforms.inspector.schema
  (:require
   [metabase.util.malli.registry :as mr]))

;;; -------------------------------------------------- Field & Table Schemas --------------------------------------------------

(mr/def ::field-stats
  "Statistics for a field from fingerprints."
  [:map
   [:distinct-count {:optional true} :int]
   [:nil-percent {:optional true} :double]
   ;; Number stats
   [:min {:optional true} :double]
   [:max {:optional true} :double]
   [:avg {:optional true} :double]
   [:q1 {:optional true} :double]
   [:q3 {:optional true} :double]
   ;; Temporal stats
   [:earliest {:optional true} :string]
   [:latest {:optional true} :string]])

(mr/def ::field
  "Field metadata for inspector."
  [:map
   [:id pos-int?]
   [:name :string]
   [:display-name {:optional true} [:maybe :string]]
   [:base-type :keyword]
   [:semantic-type {:optional true} [:maybe :keyword]]
   [:stats {:optional true} [:maybe ::field-stats]]])

(mr/def ::source-table
  "Source table metadata."
  [:map
   [:table-id pos-int?]
   [:table-name :string]
   [:schema {:optional true} [:maybe :string]]
   [:db-id pos-int?]
   [:column-count :int]
   [:fields [:sequential ::field]]])

(mr/def ::target-table
  "Target table metadata."
  [:map
   [:table-id pos-int?]
   [:table-name :string]
   [:schema {:optional true} [:maybe :string]]
   [:db-id {:optional true} pos-int?]
   [:column-count :int]
   [:fields [:sequential ::field]]])

;;; -------------------------------------------------- Lens Metadata  --------------------------------------------------

(mr/def ::lens-metadata
  "Lens metadata returned in Phase 1 discovery."
  [:map
   [:id :string]
   [:display-name :string]
   [:description {:optional true} [:maybe :string]]])

;;; -------------------------------------------------- Card Schemas --------------------------------------------------

(mr/def ::display-type
  "Valid display types for cards."
  [:enum :bar :row :line :area :pie :scalar :gauge :progress :table :hidden])

(mr/def ::card
  "A visualization card in the inspector output."
  [:map
   [:id :string]
   [:section-id {:optional true} [:maybe :string]] ; nil for hidden cards
   [:title :string]
   [:display ::display-type]
   [:dataset-query :map]
   [:interestingness {:optional true} [:maybe number?]] ; allow int or double
   [:summary {:optional true} :boolean]                 ; true if FE should send summary back
   [:visualization-settings {:optional true} :map]
   ;; For comparison layout
   [:group-id {:optional true} [:maybe :string]]
   [:group-role {:optional true} [:enum :input :output]]
   [:group-order {:optional true} :int]
   ;; For stats card dependency
   [:stats-card-id {:optional true} [:maybe :string]] ; ID of companion stats card
   ])

;;; -------------------------------------------------- Section Schemas --------------------------------------------------

(mr/def ::section
  "A section grouping cards in a lens."
  [:map
   [:id :string]
   [:title :string]
   [:description {:optional true} [:maybe :string]]])

;;; -------------------------------------------------- Summary & Alerts --------------------------------------------------

(mr/def ::summary-highlight
  "A highlight in the lens summary."
  [:map
   [:label :string]
   [:value {:optional true} [:maybe :any]]
   [:card-id {:optional true} :string]])

(mr/def ::lens-summary
  "Summary section of a lens."
  [:map
   [:text {:optional true} [:maybe :string]]
   [:highlights {:optional true} [:sequential ::summary-highlight]]
   [:alerts {:optional true} [:sequential :map]]])

;;; -------------------------------------------------- Drill Lens --------------------------------------------------

(mr/def ::drill-lens
  "A drill-down lens available from the current lens."
  [:map
   [:id :string]
   [:display-name :string]
   [:description {:optional true} [:maybe :string]]])

;;; -------------------------------------------------- Lens Response  --------------------------------------------------

(mr/def ::layout-type
  "Layout hints for the frontend."
  [:enum :flat :comparison])

(mr/def ::lens
  "Full lens contents returned in Phase 2."
  [:map
   [:id :string]
   [:display-name :string]
   [:layout ::layout-type]
   [:summary {:optional true} ::lens-summary]
   ; [:filters {:optional true} [:sequential ::filter]] ;; TODO
   [:drill-lenses {:optional true} [:sequential ::drill-lens]]
   [:sections [:sequential ::section]]
   [:cards [:sequential ::card]]
   ;; Internal: trigger definitions for heuristics evaluation
   [:alert-triggers {:optional true} [:sequential :map]]
   [:drill-lens-triggers {:optional true} [:sequential :map]]])

;;; -------------------------------------------------- Discovery Response  --------------------------------------------------

(mr/def ::discovery-response
  "Response from GET /api/ee/transform/:id/inspect"
  [:map
   [:name :string]
   [:sources [:sequential ::source-table]]
   [:target {:optional true} [:maybe ::target-table]]
   [:available-lenses [:sequential ::lens-metadata]]])
