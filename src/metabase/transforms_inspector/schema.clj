(ns metabase.transforms-inspector.schema
  "Schemas for Transform Inspector.

   Key principles:
   - Cards are generic; lens-specific data goes in :metadata
   - Only two layouts: :flat and :comparison
   - FE interprets rendering based on lens type + card metadata"
  (:require
   [malli.util :as mut]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; -------------------------------------------------- Field & Table Schemas --------------------------------------------------

(mr/def ::field-stats
  "Statistics for a field from fingerprints."
  [:map
   [:distinct_count {:optional true} :int]
   [:nil_percent {:optional true} :double]
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
   [:display_name {:optional true} [:maybe :string]]
   [:base_type ::lib.schema.common/base-type]
   [:semantic_type {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
   [:stats {:optional true} [:maybe ::field-stats]]])

(mr/def ::table
  "Table metadata."
  [:map
   [:table_id pos-int?]
   [:table_name :string]
   [:schema {:optional true} [:maybe :string]]
   [:db_id pos-int?]
   [:column_count :int]
   [:fields [:sequential ::field]]])

;;; -------------------------------------------------- Visited Fields --------------------------------------------------

(mr/def ::visited-fields
  "Field IDs used in semantically important query clauses.
   Used for interestingness scoring and preselection."
  [:map
   [:all {:optional true} [:set pos-int?]]])

;;; -------------------------------------------------- Lens Metadata --------------------------------------------------

(mr/def ::complexity-level
  "Estimated complexity/cost of generating a lens."
  [:enum :fast :slow :very-slow])

(mr/def ::complexity
  "Complexity estimate for a lens."
  [:map
   [:level ::complexity-level]
   [:score {:optional true} pos-int?]])

(mr/def ::lens-metadata
  [:map
   [:id :string]
   [:display_name :string]
   [:description {:optional true} [:maybe :string]]
   [:complexity {:optional true} ::complexity]])

;;; -------------------------------------------------- Cards --------------------------------------------------

(mr/def ::display-type
  "Valid display types for cards."
  [:enum :bar :row :line :area :pie :scalar :gauge :progress :table :hidden])

;;; Common card metadata schemas

(mr/def ::dedup-key
  "Key for deduplicating identical queries across lenses.
   Typically a vector like [:table_count table-id]."
  [:sequential :any])

(mr/def ::group-role
  "Role of a card within a comparison group."
  [:enum :input :output])

(mr/def ::comparison-metadata
  "Metadata for cards in comparison layouts."
  [:map
   [:group_id :string]
   [:group_role ::group-role]
   [:group_order :int]])

(mr/def ::join-metadata
  "Common metadata for join-related cards and triggers."
  [:map
   [:join_step {:optional true} :int]
   [:join_alias {:optional true} :string]
   [:join_strategy {:optional true} :keyword]])

(mr/def ::join-step-metadata
  "Metadata for join analysis cards."
  [:merge
   [:map [:card_type :keyword #_[:enum :base_count :join_step :table_count]]]
   (mut/optional-keys ::join-metadata)])

(mr/def ::card-metadata
  "Optional metadata for cards. An open map that may contain keys from
   comparison-metadata, join-step-metadata, or other lens-specific data."
  (mut/open-schema
   [:merge
    [:map
     [:dedup_key {:optional true} ::dedup-key]
     ;; Card IDs this card depends on (e.g. for degeneracy checks)
     [:depends_on_cards {:optional true} [:set :string]]]
    (mut/optional-keys ::comparison-metadata)
    (mut/optional-keys ::join-step-metadata)]))

(mr/def ::card
  "A visualization card in the inspector output.

   Cards are generic - lens-specific data goes in :metadata.
   The :metadata map is opaque to the core but interpreted by
   lens-specific lib utilities on the frontend. "
  [:map
   [:id :string]
   [:section_id {:optional true} [:maybe :string]]
   [:title :string]
   [:display ::display-type]
   [:dataset_query ::lib.schema/query]
   ;; Lens-specific metadata - opaque to core, interpreted by FE
   [:metadata {:optional true} ::card-metadata]])

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
   [:card_id {:optional true} :string]])

(mr/def ::lens-summary
  "Summary section of a lens."
  [:map
   [:text {:optional true} [:maybe :string]]
   [:highlights {:optional true} [:sequential ::summary-highlight]]
   [:alerts {:optional true} [:sequential :map]]])

;;; -------------------------------------------------- Triggers --------------------------------------------------

(mr/def ::trigger-condition
  "A named condition that triggers an alert or drill lens.
   Evaluated by multimethod in lib against card results.
   Only :name is required; other keys are condition-specific."
  [:map {:closed false}
   [:name :keyword]])

(mr/def ::trigger-metadata
  "Metadata for triggers. Uses same join fields as card metadata."
  (mut/open-schema
   (mut/optional-keys ::join-metadata)))

(mr/def ::alert-trigger
  "Definition for conditional alerts.
   FE evaluates condition against card results and shows alert if triggered."
  [:map
   [:id :string]
   [:condition ::trigger-condition]
   [:severity [:enum :info :warning :error]]
   [:message :string]
   [:metadata {:optional true} ::trigger-metadata]])

(mr/def ::drill-lens-trigger
  "Definition for conditional drill lens availability.
   FE evaluates condition and shows drill lens option if triggered.
   :params is passed to the drill lens when triggered."
  [:map
   [:lens_id :string]
   [:condition ::trigger-condition]
   [:params {:optional true} [:map-of :keyword :any]]
   [:reason {:optional true} :string]
   [:metadata {:optional true} ::trigger-metadata]])

;;; -------------------------------------------------- Drill Lenses --------------------------------------------------

(mr/def ::drill-lens
  "A drill-down lens available from the current lens."
  [:map
   [:id :string]
   [:display_name :string]
   [:description {:optional true} [:maybe :string]]])

;;; -------------------------------------------------- Lens Response --------------------------------------------------

(mr/def ::lens
  "Full lens contents and drill lens/alert triggers."
  [:map
   [:id :string]
   [:display_name :string]
   [:complexity {:optional true} ::complexity]
   [:summary {:optional true} ::lens-summary]
   [:sections [:sequential ::section]]
   [:cards [:sequential ::card]]
   [:drill_lenses {:optional true} [:sequential ::drill-lens]]
   ;; Trigger definitions - FE evaluates conditions against card results
   [:alert_triggers {:optional true} [:sequential ::alert-trigger]]
   [:drill_lens_triggers {:optional true} [:sequential ::drill-lens-trigger]]])

;;; -------------------------------------------------- Discovery Response --------------------------------------------------

(mr/def ::inspector-status
  "Status of the inspector result."
  [:enum :not-run :ready])

(mr/def ::discovery-response
  "Response from lens discovery."
  [:map
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:status ::inspector-status]
   [:sources [:sequential ::table]]
   [:target {:optional true} [:maybe ::table]]
   [:visited_fields {:optional true} [:maybe ::visited-fields]]
   [:available_lenses [:sequential ::lens-metadata]]])
