(ns metabase-enterprise.checker.schemas
  "Malli schemas for serdes YAML entity files.

   Pure data definitions — no dependencies on the checker module.
   These schemas define the structural shape of each entity type
   in a serdes export. They are used by the structural checker for
   validation and can be exported as JSON Schema for LLM consumption.

   Entity types: Database, Table, Field, Card, Dashboard, Collection.
   Supporting types: DatasetQuery, ResultMetadataColumn, DashboardCard, DashboardTab.")

;;; ===========================================================================
;;; Portable Reference Schemas
;;;
;;; Serdes uses vectors to represent references that get resolved on import.
;;; ===========================================================================

(def PortableDatabaseRef
  "Reference to a database by name."
  :string)

(def PortableTableRef
  "Reference to a table: [db-name schema-name table-name].
   schema-name can be null for schema-less databases (e.g., SQLite)."
  [:tuple :string [:maybe :string] :string])

(def PortableFieldRef
  "Reference to a field: [db-name schema-name table-name field-name].
   schema-name can be null for schema-less databases."
  [:tuple :string [:maybe :string] :string :string])

(def PortableCardRef
  "Reference to a card by entity_id."
  :string)

(def PortableDashboardTabRef
  "Reference to a dashboard tab: [dashboard-entity-id, tab-entity-id]."
  [:tuple :string :string])

;;; ===========================================================================
;;; Common Schemas
;;; ===========================================================================

(def timestamp-pattern "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.*$")
(def base-type-pattern "^type/\\w+$")

(def Timestamp
  "ISO 8601 timestamp string."
  [:re (re-pattern timestamp-pattern)])

(def BaseType
  "Metabase base type, e.g., type/Integer, type/Text."
  [:re (re-pattern base-type-pattern)])

(def SemanticType
  "Metabase semantic type, e.g., type/PK, type/FK, type/Category."
  [:maybe [:re (re-pattern base-type-pattern)]])

(def VisibilityType
  "Field or table visibility."
  [:maybe [:enum "normal" "hidden" "sensitive" "details-only" "retired"]])

(def NanoId
  "A 21-character NanoID string."
  [:re #"^[A-Za-z0-9_\-]{21}$"])

(def SerdesMeta
  "Serdes metadata for identifying entities."
  [:sequential
   [:map
    [:id :string]
    [:model :string]
    [:label {:optional true} :string]]])

;;; ===========================================================================
;;; Database Schema
;;; ===========================================================================

(def Database
  "Schema for database YAML files."
  [:map
   [:name :string]
   [:engine :string]
   [:created_at {:optional true} Timestamp]
   [:settings {:optional true} [:maybe :map]]
   [:serdes/meta SerdesMeta]])

;;; ===========================================================================
;;; Table Schema
;;; ===========================================================================

(def Table
  "Schema for table YAML files."
  [:map
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:created_at {:optional true} Timestamp]
   [:active {:optional true} :boolean]
   [:visibility_type {:optional true} VisibilityType]
   [:schema {:optional true} [:maybe :string]]
   [:db_id {:optional true} :string]
   [:serdes/meta SerdesMeta]])

;;; ===========================================================================
;;; Field Schema
;;; ===========================================================================

(def Field
  "Schema for field YAML files."
  [:map
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:created_at {:optional true} Timestamp]
   [:active {:optional true} :boolean]
   [:visibility_type {:optional true} VisibilityType]
   [:table_id PortableTableRef]
   [:database_type :string]
   [:base_type BaseType]
   [:effective_type {:optional true} [:maybe BaseType]]
   [:semantic_type {:optional true} SemanticType]
   [:fk_target_field_id {:optional true} [:maybe [:or PortableFieldRef :nil]]]
   [:position {:optional true} :int]
   [:serdes/meta SerdesMeta]])

;;; ===========================================================================
;;; Dataset Query Schemas
;;; ===========================================================================

(def NativeQuery
  "Native SQL query."
  [:map
   [:database PortableDatabaseRef]
   [:type [:enum "native"]]
   [:native [:map
             [:query :string]
             [:template-tags {:optional true} :map]]]])

(def MBQLQuery
  "MBQL structured query."
  [:map
   [:database PortableDatabaseRef]
   [:type [:enum "query"]]
   [:query [:map
            [:source-table {:optional true} [:or PortableTableRef :string]]
            [:source-query {:optional true} :map]
            [:aggregation {:optional true} :any]
            [:breakout {:optional true} :any]
            [:filter {:optional true} :any]
            [:joins {:optional true} :any]
            [:order-by {:optional true} :any]
            [:limit {:optional true} :int]
            [:fields {:optional true} :any]
            [:expressions {:optional true} :any]]]])

(def DatasetQuery
  "Either a native or MBQL query."
  [:or NativeQuery MBQLQuery])

;;; ===========================================================================
;;; Result Metadata
;;; ===========================================================================

(def ResultMetadataColumn
  "A column in result_metadata."
  [:map
   [:name :string]
   [:base_type {:optional true} [:or BaseType :string]]
   [:display_name {:optional true} :string]
   [:effective_type {:optional true} [:or BaseType :string :nil]]
   [:semantic_type {:optional true} [:or SemanticType :string :nil]]
   [:field_ref {:optional true} :any]
   [:id {:optional true} [:or PortableFieldRef :int :nil]]
   [:table_id {:optional true} [:or PortableTableRef :int :nil]]
   [:fk_target_field_id {:optional true} [:or PortableFieldRef :int :nil]]])

;;; ===========================================================================
;;; Card Schema
;;; ===========================================================================

(def Card
  "Schema for card (question/model) YAML files."
  [:map
   [:name :string]
   [:entity_id :string]
   [:dataset_query DatasetQuery]
   [:database_id PortableDatabaseRef]
   [:display :string]
   [:type [:enum "question" "model" "metric"]]
   [:serdes/meta SerdesMeta]
   ;; optional
   [:description {:optional true} [:maybe :string]]
   [:created_at {:optional true} Timestamp]
   [:creator_id {:optional true} :string]
   [:archived {:optional true} :boolean]
   [:archived_directly {:optional true} :boolean]
   [:query_type {:optional true} [:enum "query" "native"]]
   [:table_id {:optional true} [:maybe [:or PortableTableRef :nil]]]
   [:source_card_id {:optional true} [:maybe [:or PortableCardRef :nil]]]
   [:dashboard_id {:optional true} [:maybe [:or NanoId :nil]]]
   [:collection_id {:optional true} [:maybe [:or NanoId :nil]]]
   [:collection_position {:optional true} [:maybe :int]]
   [:collection_preview {:optional true} :boolean]
   [:result_metadata {:optional true} [:maybe [:sequential ResultMetadataColumn]]]
   [:visualization_settings {:optional true} :map]
   [:parameter_mappings {:optional true} [:sequential :any]]
   [:parameters {:optional true} [:sequential :any]]
   [:card_schema {:optional true} [:maybe :int]]
   [:metabase_version {:optional true} [:maybe :string]]
   [:document_id {:optional true} [:maybe :string]]
   [:enable_embedding {:optional true} :boolean]
   [:embedding_type {:optional true} [:maybe :string]]
   [:embedding_params {:optional true} [:maybe :map]]
   [:made_public_by_id {:optional true} [:maybe :string]]
   [:public_uuid {:optional true} [:maybe :string]]])

;;; ===========================================================================
;;; Dashboard Schema
;;; ===========================================================================

(def ^:private grid-width
  "Dashboard grid is 24 columns wide."
  24)

(def DashboardTab
  "A tab on a dashboard."
  [:map
   [:entity_id :string]
   [:name :string]
   [:position :int]
   [:serdes/meta SerdesMeta]
   ;; optional
   [:created_at {:optional true} Timestamp]])

(def DashboardCard
  "A card on a dashboard. card_id is null for virtual cards (headings, text, links)."
  [:map
   [:entity_id :string]
   [:col [:and :int [:>= 0]]]
   [:row [:and :int [:>= 0]]]
   [:size_x [:and :int [:>= 1] [:<= grid-width]]]
   [:size_y [:and :int [:>= 1]]]
   [:serdes/meta SerdesMeta]
   ;; optional
   [:card_id {:optional true} [:maybe [:or PortableCardRef :nil]]]
   [:action_id {:optional true} [:maybe [:or :string :nil]]]
   [:dashboard_tab_id {:optional true} [:maybe [:or PortableDashboardTabRef :nil]]]
   [:created_at {:optional true} Timestamp]
   [:parameter_mappings {:optional true} [:maybe [:sequential :any]]]
   [:inline_parameters {:optional true} [:maybe [:sequential :any]]]
   [:series {:optional true} [:maybe [:sequential :any]]]
   [:visualization_settings {:optional true} :map]])

(def Dashboard
  "Schema for dashboard YAML files."
  [:map
   [:name :string]
   [:entity_id :string]
   [:serdes/meta SerdesMeta]
   ;; optional
   [:description {:optional true} [:maybe :string]]
   [:created_at {:optional true} Timestamp]
   [:creator_id {:optional true} :string]
   [:archived {:optional true} :boolean]
   [:archived_directly {:optional true} :boolean]
   [:collection_id {:optional true} [:maybe [:or NanoId :nil]]]
   [:collection_position {:optional true} [:maybe :int]]
   [:tabs {:optional true} [:sequential DashboardTab]]
   [:dashcards {:optional true} [:sequential DashboardCard]]
   [:parameters {:optional true} [:sequential :any]]
   [:width {:optional true} [:maybe [:enum "full" "fixed"]]]
   [:position {:optional true} [:maybe :int]]
   [:auto_apply_filters {:optional true} :boolean]
   [:enable_embedding {:optional true} :boolean]
   [:embedding_type {:optional true} [:maybe :string]]
   [:embedding_params {:optional true} [:maybe :map]]
   [:made_public_by_id {:optional true} [:maybe :string]]
   [:public_uuid {:optional true} [:maybe :string]]
   [:show_in_getting_started {:optional true} :boolean]
   [:initially_published_at {:optional true} [:maybe Timestamp]]
   [:caveats {:optional true} [:maybe :string]]
   [:points_of_interest {:optional true} [:maybe :string]]])

;;; ===========================================================================
;;; Collection Schema
;;; ===========================================================================

(def Collection
  "Schema for collection YAML files."
  [:map
   [:name :string]
   [:entity_id :string]
   [:serdes/meta SerdesMeta]
   ;; optional
   [:description {:optional true} [:maybe :string]]
   [:created_at {:optional true} Timestamp]
   [:slug {:optional true} :string]
   [:archived {:optional true} :boolean]
   [:archived_directly {:optional true} [:maybe :boolean]]
   [:type {:optional true} [:maybe :string]]
   [:authority_level {:optional true} [:maybe :string]]
   [:namespace {:optional true} [:maybe :string]]
   [:parent_id {:optional true} [:maybe [:or NanoId :nil]]]
   [:personal_owner_id {:optional true} [:maybe :string]]
   [:is_sample {:optional true} :boolean]
   [:is_remote_synced {:optional true} :boolean]
   [:workspace_id {:optional true} [:maybe :string]]
   [:archive_operation_id {:optional true} [:maybe :string]]])

;;; ===========================================================================
;;; Schema Registry
;;; ===========================================================================

(def schemas
  "Map of entity type keyword to Malli schema."
  {:database   Database
   :table      Table
   :field      Field
   :card       Card
   :dashboard  Dashboard
   :collection Collection})
