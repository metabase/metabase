(ns metabase-enterprise.transforms.inspector-v2.schema
  "Schemas for Transform Inspector v2.

   The v2 inspector uses a lens-based approach:
   - Phase 1 (discover): Returns sources, target, and available lenses
   - Phase 2 (get-lens): Returns sections and cards for a specific lens

   Key design principles:
   - Cards are generic; lens-specific data goes in :metadata
   - Only two layouts: :flat and :comparison
   - FE interprets rendering based on lens type + card metadata"
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
  "Target table metadata (output of transform)."
  [:map
   [:table-id pos-int?]
   [:table-name :string]
   [:schema {:optional true} [:maybe :string]]
   [:db-id {:optional true} pos-int?]
   [:column-count :int]
   [:fields [:sequential ::field]]])

;;; -------------------------------------------------- Visited Fields --------------------------------------------------

(mr/def ::visited-fields
  "Field IDs used in semantically important query clauses.
   Used for interestingness scoring and preselection."
  [:map
   [:join-fields {:optional true} [:set pos-int?]]
   [:filter-fields {:optional true} [:set pos-int?]]
   [:group-by-fields {:optional true} [:set pos-int?]]
   [:order-by-fields {:optional true} [:set pos-int?]]
   [:all {:optional true} [:set pos-int?]]])

;;; -------------------------------------------------- Lens Metadata --------------------------------------------------

(mr/def ::lens-metadata
  "Lens metadata returned in Phase 1 discovery."
  [:map
   [:id :string]
   [:display-name :string]
   [:description {:optional true} [:maybe :string]]])

;;; -------------------------------------------------- Cards --------------------------------------------------

(mr/def ::display-type
  "Valid display types for cards."
  [:enum :bar :row :line :area :pie :scalar :gauge :progress :table :hidden])

;;; Common card metadata schemas

(mr/def ::dedup-key
  "Key for deduplicating identical queries across lenses.
   Typically a vector like [:table-count table-id]."
  [:sequential :any])

(mr/def ::group-role
  "Role of a card within a comparison group."
  [:enum :input :output])

(mr/def ::comparison-metadata
  "Metadata for cards in comparison layouts."
  [:map
   [:group-id :string]
   [:group-role ::group-role]
   [:group-order :int]])

(mr/def ::join-step-metadata
  "Metadata for join analysis cards."
  [:map
   [:card-type [:enum :base-count :join-step :table-count]]
   [:join-step {:optional true} :int]
   [:join-alias {:optional true} :string]
   [:join-strategy {:optional true} :keyword]])

(mr/def ::card
  "A visualization card in the inspector output.

   Cards are generic - lens-specific data goes in :metadata.
   The :metadata map is opaque to the core but interpreted by
   lens-specific lib utilities on the frontend.

   Common metadata keys:
   - :dedup-key - for deduplicating identical queries across lenses
   - :group-id, :group-role, :group-order - for comparison grouping
   - :card-type - lens-specific card type identifier
   - :table-id, :field-id - entity references"
  [:map
   [:id :string]
   [:section-id {:optional true} [:maybe :string]]
   [:title :string]
   [:display ::display-type]
   [:dataset-query :map]
   [:interestingness {:optional true} [:maybe number?]]
   [:summary {:optional true} :boolean]
   [:visualization-settings {:optional true} :map]
   ;; Lens-specific metadata - opaque to core, interpreted by FE
   [:metadata {:optional true} :map]])

;;; -------------------------------------------------- Sections --------------------------------------------------

(mr/def ::layout-type
  "Layout hints for sections.
   - :flat - cards displayed in a grid
   - :comparison - cards grouped for side-by-side comparison"
  [:enum :flat :comparison])

(mr/def ::section
  "A section grouping cards in a lens."
  [:map
   [:id :string]
   [:title :string]
   [:description {:optional true} [:maybe :string]]
   [:layout {:optional true} ::layout-type]])

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

;;; -------------------------------------------------- Triggers --------------------------------------------------

(mr/def ::comparator
  "Comparison operators for trigger conditions."
  [:enum :> :>= :< :<= := :!=])

(mr/def ::trigger-condition
  "A condition that triggers an alert or drill lens.
   Evaluated by lib against card results."
  [:map
   [:card-id :string]
   [:field {:optional true} [:or :string :int :keyword]]
   [:comparator ::comparator]
   [:threshold :any]])

(mr/def ::alert-trigger
  "Definition for conditional alerts.
   FE evaluates condition against card results and shows alert if triggered."
  [:map
   [:id :string]
   [:condition ::trigger-condition]
   [:severity [:enum :info :warning :error]]
   [:message :string]])

(mr/def ::drill-lens-trigger
  "Definition for conditional drill lens availability.
   FE evaluates condition and shows drill lens option if triggered.
   :params is passed to the drill lens when triggered."
  [:map
   [:lens-id :string]
   [:condition ::trigger-condition]
   [:params {:optional true} [:map-of :keyword :any]]
   [:reason {:optional true} :string]])

;;; -------------------------------------------------- Drill Lenses --------------------------------------------------

(mr/def ::drill-lens
  "A drill-down lens available from the current lens."
  [:map
   [:id :string]
   [:display-name :string]
   [:description {:optional true} [:maybe :string]]])

;;; -------------------------------------------------- Lens Response --------------------------------------------------

(mr/def ::lens
  "Full lens contents returned in Phase 2."
  [:map
   [:id :string]
   [:display-name :string]
   [:summary {:optional true} ::lens-summary]
   [:sections [:sequential ::section]]
   [:cards [:sequential ::card]]
   [:drill-lenses {:optional true} [:sequential ::drill-lens]]
   ;; Trigger definitions - FE evaluates conditions against card results
   [:alert-triggers {:optional true} [:sequential ::alert-trigger]]
   [:drill-lens-triggers {:optional true} [:sequential ::drill-lens-trigger]]])

;;; -------------------------------------------------- Discovery Response --------------------------------------------------

(mr/def ::inspector-status
  "Status of the inspector result."
  [:enum :not-run :ready])

(mr/def ::discovery-response
  "Response from Phase 1 discovery.

   Returns structural metadata and available lenses.
   This is a cheap operation - no query execution."
  [:map
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:status ::inspector-status]
   [:sources [:sequential ::source-table]]
   [:target {:optional true} [:maybe ::target-table]]
   [:visited-fields {:optional true} [:maybe ::visited-fields]]
   [:available-lenses [:sequential ::lens-metadata]]])
