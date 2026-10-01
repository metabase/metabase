import type {
  BaseEntityId,
  CollectionEssentials,
  DashboardId,
  PaginationRequest,
  PaginationResponse,
  VisualizationDisplay,
} from "metabase-types/api";

import type { CardId, CardType } from "./card";
import type { DatabaseId } from "./database";
import type { SortDirection } from "./sorting";
import type { TableId } from "./table";
import type { UserId, UserInfo } from "./user";
export type CollectionNamespace =
  | null
  | "snippets"
  | "transforms"
  | "analytics"
  | "tenant-specific"
  | "shared-tenant-collection";

// Collection ID can be either a numeric or entity id
export type RegularCollectionId = number | string;

export type CollectionId =
  | RegularCollectionId
  | "root"
  | "personal"
  | "users"
  | "tenant"
  | "trash";

export type CollectionContentModel = CollectionItemModel;

export type CollectionAuthorityLevel = "official" | null;

export type CollectionType =
  | "instance-analytics"
  | "trash"
  | "remote-synced"
  | "library"
  | "library-data"
  | "library-metrics"
  | "shared-tenant-collection"
  | "tenant-specific-root-collection"
  | null;

export type LastEditInfo = Pick<
  UserInfo,
  "id" | "email" | "first_name" | "last_name"
> & {
  timestamp: string;
};

export interface Collection {
  id: CollectionId;
  name: string;
  slug?: string;
  // "" for the default for EE's CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID
  entity_id?: BaseEntityId | "";
  description: string | null;
  can_write: boolean;
  can_restore: boolean;
  can_delete: boolean;
  archived?: boolean;
  children?: Collection[];
  authority_level?: CollectionAuthorityLevel;
  type?: CollectionType;
  is_remote_synced?: boolean;
  namespace: CollectionNamespace | null;

  parent_id?: CollectionId | null;
  personal_owner_id?: UserId;
  is_personal?: boolean;
  is_sample?: boolean; // true if the collection part of the sample content
  is_library_root?: boolean;

  location: string | null;
  effective_location?: string; // location path containing only those collections that the user has permission to access
  effective_ancestors?: CollectionEssentials[];

  here?: CollectionContentModel[];
  below?: CollectionContentModel[];

  git_sync_enabled?: boolean;

  // Assigned on FE
  originalName?: string;
  path?: CollectionId[] | null;
}

export const COLLECTION_ITEM_MODELS = [
  "card",
  "dataset",
  "metric",
  "dashboard",
  "snippet",
  "collection",
  "indexed-entity",
  "document",
  "table",
  "transform",
  "measure",
  "exploration",
] as const;
export type CollectionItemModel = (typeof COLLECTION_ITEM_MODELS)[number];

export type CollectionItemId = number;

export interface CollectionItem {
  id: CollectionItemId;
  entity_id?: BaseEntityId;
  model: CollectionItemModel;
  name: string;
  description: string | null;
  archived?: boolean;
  copy?: boolean;
  collection_position?: number | null;
  collection_preview?: boolean | null;
  fully_parameterized?: boolean | null;
  based_on_upload?: TableId | null; // only for models
  collection?: Collection | null;
  collection_id?: CollectionId | null; // parent collection id
  namespace?: CollectionNamespace; // namespace of the item itself
  collection_namespace?: CollectionNamespace; // namespace of the parent collection
  display?: VisualizationDisplay;
  personal_owner_id?: UserId;
  database_id?: DatabaseId;
  moderated_status?: string | null;
  type?: CollectionType | CardType;
  here?: CollectionItemModel[];
  below?: CollectionItemModel[];
  can_write?: boolean;
  can_restore?: boolean;
  can_delete?: boolean;
  is_library_root?: boolean;
  "last-edit-info"?: LastEditInfo;
  location?: string | null;
  effective_location?: string;
  authority_level?: CollectionAuthorityLevel;
  dashboard_count?: number | null;
  is_shared_tenant_collection?: boolean;
  is_tenant_dashboard?: boolean;
  is_remote_synced?: boolean;
}

export interface CollectionListQuery {
  archived?: boolean;
  "exclude-other-user-collections"?: boolean;
  "exclude-archived"?: boolean;
  "personal-only"?: boolean;
  namespace?: CollectionNamespace;
  tree?: boolean;
}

export type getCollectionRequest = {
  id: CollectionId;
  namespace?: CollectionNamespace;
  ignore_error?: boolean;
};

export type ListCollectionItemsSortColumn =
  | "name"
  | "description"
  | "last_edited_at"
  | "last_edited_by"
  | "model";

// Query params are kebab-case, matching the endpoint. The sort params are spelled out here rather than
// intersecting `SortingOptions`, which stays snake_case for the endpoints that still expect that (`/api/task`,
// `/api/ee/stale/:id`, `/api/notification/admin`).
export type ListCollectionItemsRequest = {
  id: CollectionId;
  models?: (CollectionItemModel | "no_models")[];
  q?: string;
  "include-available-models"?: boolean;
  archived?: boolean;
  "pinned-state"?: "all" | "is_pinned" | "is_not_pinned";
  namespace?: CollectionNamespace;
  "collection-type"?: CollectionType;
  "show-dashboard-questions"?: boolean;
  "include-library"?: boolean;
  "sort-column"?: ListCollectionItemsSortColumn;
  "sort-direction"?: SortDirection;
} & PaginationRequest;

export type ListCollectionItemsResponse = {
  data: CollectionItem[];
  models: CollectionItemModel[] | null;
  available_models?: string[];
} & PaginationResponse;

export type GetCollectionItemsMetadataRequest = {
  id: CollectionId;
  models?: CollectionItemModel[];
  "show-dashboard-questions"?: boolean;
  namespace?: CollectionNamespace;
  "include-library"?: boolean;
};

export type CollectionItemsMetadata = {
  available_models: string[];
  // The size of the whole list, unlike the `total` of a paged, filtered items response.
  total_items: number;
};

export interface UpdateCollectionRequest {
  id: RegularCollectionId;
  name?: string;
  description?: string;
  archived?: boolean;
  parent_id?: RegularCollectionId | null;
  authority_level?: CollectionAuthorityLevel;
  type?: CollectionType;
  is_remote_synced?: boolean;
}

export interface CreateCollectionRequest {
  name: string;
  description?: string | null;
  parent_id?: CollectionId | null;
  namespace?: CollectionNamespace;
  authority_level?: CollectionAuthorityLevel;
  is_shared_tenant_collection?: boolean;
}

export type ListCollectionsRequest = {
  archived?: boolean;
  namespace?: CollectionNamespace;
  "personal-only"?: boolean;
  "exclude-other-user-collections"?: boolean;
  collection_type?: CollectionType;
};
export type ListCollectionsTreeRequest = {
  "exclude-archived"?: boolean;
  "exclude-other-user-collections"?: boolean;
  "include-library"?: boolean;
  namespace?: CollectionNamespace;
  namespaces?: string[];
  shallow?: boolean;
  "collection-id"?: RegularCollectionId | null;
  collection_type?: CollectionType;
  "include-tenant-collections"?: boolean;
};

export interface DeleteCollectionRequest {
  id: RegularCollectionId;
}

export interface DashboardQuestionCandidate {
  id: CardId;
  name: string;
  description: string | null;
  sole_dashboard_info: {
    id: DashboardId;
    name: string;
    description: string | null;
  };
}

export interface GetCollectionDashboardQuestionCandidatesRequest extends PaginationRequest {
  collectionId: CollectionId;
}

export interface GetCollectionDashboardQuestionCandidatesResult {
  total: number;
  data: DashboardQuestionCandidate[];
}

export interface MoveCollectionDashboardCandidatesRequest {
  collectionId: CollectionId;
  cardIds: CardId[];
}

export interface MoveCollectionDashboardCandidatesResult {
  moved: CardId[];
}

type LibraryChild = {
  description: string;
  id: number;
  name: string;
};

export type LibraryCollection = CollectionItem & {
  effective_children: LibraryChild[];
};

export type GetLibraryCollectionResponse = LibraryCollection | { data: null };
