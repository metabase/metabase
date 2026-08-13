(ns metabase-enterprise.data-studio.api.usage-metadata.schema
  "Request and response contracts for the usage-metadata cleanup API."
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def ^{:doc "Maximum cleanup-list search length."} max-search-length 254)
(def ^{:doc "Maximum candidate name override length."} max-name-length 254)
(def ^{:doc "Maximum candidate description override length."} max-description-length 10000)

(mr/def ::snapshot-summary
  [:map [:table_count ms/IntGreaterThanOrEqualToZero]])

(mr/def ::snapshot
  [:map
   [:id ms/PositiveInt]
   [:finished_at :any]
   [:summary [:maybe ::snapshot-summary]]])

(mr/def ::database
  [:map [:id ms/PositiveInt] [:name :string]])

(mr/def ::creation-blocker
  [:enum :table-not-published :table-inactive :table-uneditable :unsupported-candidate-type])

(mr/def ::table
  [:map
   [:id ms/PositiveInt]
   [:schema [:maybe :string]]
   [:display_name :string]
   [:is_published :boolean]
   [:database ::database]])

(mr/def ::table-summary
  [:map
   [:table ::table]
   [:candidate_count ms/IntGreaterThanOrEqualToZero]])

(mr/def ::candidate-type [:enum :table :metric :measure :segment])
(mr/def ::modeling-status [:enum :missing :partially-modeled :modeled])
(mr/def ::predicate-kind [:enum "boolean" "category" "number" "temporal" "other"])

(mr/def ::presented-predicate
  [:map
   [:signature :string]
   [:display_name :string]
   [:kind ::predicate-kind]])

(mr/def ::candidate-presentation
  [:map
   [:aggregation {:optional true} [:map [:display_name :string]]]
   [:predicates [:sequential ::presented-predicate]]])

(mr/def ::candidate-evidence
  [:map
   [:verified_source_count ms/IntGreaterThanOrEqualToZero]
   [:official_source_count ms/IntGreaterThanOrEqualToZero]
   [:popular_source_count ms/IntGreaterThanOrEqualToZero]
   [:distinct_source_count ms/IntGreaterThanOrEqualToZero]
   [:recent_view_count ms/IntGreaterThanOrEqualToZero]])

(mr/def ::candidate-definition
  [:or ::lib.schema/query [:map [:table_id ms/PositiveInt]]])

(mr/def ::candidate-summary
  [:map
   [:id ms/PositiveInt]
   [:candidate_type ::candidate-type]
   [:display_name :string]
   [:presentation ::candidate-presentation]
   [:modeling_status ::modeling-status]
   [:dismissed :boolean]
   [:evidence ::candidate-evidence]])

(mr/def ::model-lineage-item
  [:map [:id ms/PositiveInt] [:name :string]])

(mr/def ::dependency-path
  [:map
   [:direct :boolean]
   [:models [:sequential ::model-lineage-item]]])

(mr/def ::candidate-source
  [:map
   [:card_id ms/PositiveInt]
   [:card_name [:maybe :string]]
   [:card_type [:enum :question :model]]
   [:verified :boolean]
   [:official :boolean]
   [:popular :boolean]
   [:recent_view_count ms/IntGreaterThanOrEqualToZero]
   [:joined :boolean]
   [:stage_numbers [:sequential ms/IntGreaterThanOrEqualToZero]]
   [:model_lineage [:maybe [:sequential ::model-lineage-item]]]
   [:dependency_paths {:optional true} [:sequential ::dependency-path]]])

(mr/def ::candidate-match
  [:map
   [:relation [:enum :exact :same-base :subset :superset :overlap]]
   [:entity_type [:enum :measure :segment]]
   [:entity [:map
             [:id ms/PositiveInt]
             [:name :string]
             [:description [:maybe :string]]]]])

(mr/def ::candidate-detail
  [:merge
   ::candidate-summary
   [:map
    [:table ::table]
    [:suggested_name :string]
    [:suggested_description [:maybe :string]]
    [:required_tables [:sequential ::table]]
    [:definition ::candidate-definition]
    [:creation_blockers [:sequential ::creation-blocker]]
    [:sources [:sequential ::candidate-source]]
    [:matches [:sequential ::candidate-match]]]])

(mr/def ::candidate-page
  [:map
   [:data [:sequential ::candidate-summary]]
   [:total ms/IntGreaterThanOrEqualToZero]
   [:limit ms/IntGreaterThanOrEqualToZero]
   [:offset ms/IntGreaterThanOrEqualToZero]
   [:snapshot [:maybe ::snapshot]]])

(mr/def ::table-page
  [:map
   [:data [:sequential ::table-summary]]
   [:total ms/IntGreaterThanOrEqualToZero]
   [:limit ms/IntGreaterThanOrEqualToZero]
   [:offset ms/IntGreaterThanOrEqualToZero]
   [:snapshot [:maybe ::snapshot]]])

(mr/def ::create-response
  [:map [:id ms/PositiveInt]])

(mr/def ::run-state
  [:map [:id ms/PositiveInt] [:status [:enum :queued :running :failed]]])

(mr/def ::refresh-status
  [:map
   [:snapshot [:maybe ::snapshot]]
   [:active [:maybe ::run-state]]
   [:failure [:maybe ::run-state]]])

(mr/def ::start-refresh-response
  [:map
   [:status [:= 202]]
   [:body [:map [:run_id ms/PositiveInt]]]])

(def ^{:doc "Validated query parameters shared by candidate and table lists."} list-query
  [:map
   [:table-id {:optional true} [:maybe ms/PositiveInt]]
   [:database-id {:optional true} [:maybe ms/PositiveInt]]
   [:candidate-type {:optional true} [:maybe ::candidate-type]]
   [:queue {:default :suggested} [:enum :suggested :used-raw :discarded]]
   [:search {:optional true} [:maybe [:string {:max max-search-length}]]]])

(def ^{:doc "Candidate identifier route schema."} candidate-id
  [:map [:id ms/PositiveInt]])

(def ^{:doc "Candidate creation override request body schema."} create-body
  [:map
   [:name {:optional true}
    [:maybe [:and ms/NonBlankString [:string {:max max-name-length}]]]]
   [:description {:optional true}
    [:maybe [:string {:max max-description-length}]]]])
