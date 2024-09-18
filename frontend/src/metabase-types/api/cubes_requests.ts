import type {
  PaginationRequest,
  PaginationResponse,
  UserId,
} from "metabase-types/api"; // Import UserId type from the appropriate location
import { SortingOptions } from "metabase-types/api/sorting"; // Import SortingOptions

export type CubesRequestId = number;

export interface CubesRequestDetails {
  id: CubesRequestId;
  description: string;
  user: string;
  admin_user: string;
  updated_at: string; // ISO format date string
  verified_status: boolean;
  in_semantic_layer: boolean;
  // Add more fields as needed for cubes request details
}

// Request and Response Types

export type GetCubesRequestDetailsRequest = {
  id: CubesRequestId;
};

export type GetCubesRequestDetailsResponse = CubesRequestDetails;

export type CreateCubesRequestDetailsRequest = {
  description: string;
  user: string;
  admin_user: string;
  verified_status: boolean;
  in_semantic_layer: boolean;
  updated_at?: string; // Optional, can be auto-generated on the server side
};

export type CreateCubesRequestDetailsResponse = CubesRequestDetails;

export type UpdateCubesRequestDetailsRequest = {
  id: CubesRequestId;
  description?: string;
  user?: string;
  admin_user?: string;
  verified_status?: boolean;
  in_semantic_layer?: boolean;
  updated_at?: string;
};

export type UpdateCubesRequestDetailsResponse = CubesRequestDetails;

export interface ListCubesRequestDetailsRequest
  extends PaginationRequest,
    Partial<SortingOptions> {
  description?: string;
  user?: string;
  admin_user?: string;
  verified_status?: boolean;
  in_semantic_layer?: boolean;
}

export interface ListCubesRequestDetailsResponse extends PaginationResponse {
  data: CubesRequestDetails[];
}

export interface DeleteCubesRequestDetailsRequest {
  id: CubesRequestId;
}
