(ns metabase.collections-rest.schema
  (:require
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli.registry :as mr]))

;(mr/def ::collection-item
;  "A collection item"
;  [:map
;   [:id pos-int?]
;   [:entity_id {:optional true} pos-int?]
;   [:model :string]
;   [:name :string]
;   [:description {:maybe :string}]
;   [:archived :boolean]
;   [:copy {:optional true} :boolean]
;   [:collection_position {:optional true} {:maybe pos-int?}]
;   [:collection_preview {:optional true} {:maybe :boolean}]
;   [:fully_parameterized {:optional true} {:maybe :boolean}]
;   [:based_on_upload {:optional true} {:maybe pos-int?}]
;   [:collection {:optional true} {:maybe pos-int?}]
;   [:collection_id {:maybe pos-int?}]
;   [:display {:optional true} :boolean]
;   [:personal_owner_id {:optional true} {:maybe pos-int?}]
;   [:database_id {:optional true} {:maybe pos-int?}]
;   [:moderated_status {:optional true} string]
;   [:type {:optional true} CollectionType | CardType]
;   [:here {:optional true} CollectionItemModel[]]
;   [:below {:optional true} CollectionItemModel[]]
;   [:can_write {:optional true} boolean]
;   [:can_restore {:optional true} boolean]
;   [:can_delete {:optional true} boolean]
;   [:last-edit-info  LastEditInfo]
;   [:location {:optional true} string]
;   [:effective_location {:optional true} string]
;   [:authority_level {:optional true} CollectionAuthorityLevel]
;   [:dashboard_count {:optional true} number | null]
;   [:getIcon () => IconProps]
;   [:getUrl (opts? Record<string, unknown>) => string]
;   [:setArchived {:optional true} (
;                   isArchived: boolean,
;                   opts?: Record<string, unknown>,
;                   ) => Promise<void>]
;   [:setPinned {:optional true} (isPinned boolean) => void]
;   [:setCollection {:optional true} (
;                     collection: Pick<Collection, "id"> | Pick<Dashboard, "id">,
;                     ) => void]
;   [:setCollectionPreview {:optional true} (isEnabled: boolean) => void]
;
;
;    ......
;   [:revision {:optional true} [:maybe int?]]
;   [:force    {:optional true} [:maybe boolean?]]
;   [:groups   [:map-of [:ref ::group-id] [:maybe [:ref ::strict-db-graph]]]]])

