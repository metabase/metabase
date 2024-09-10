import type { ColorName } from "metabase/lib/colors/types";
import type { IconName, IconProps } from "metabase/ui";
import type {
  PaginationRequest,
  PaginationResponse,
  UserId,
} from "metabase-types/api";
import { SortingOptions } from "metabase-types/api/sorting";

export type CompanyId = number;

export interface CompanyDetails {
  id: CompanyId;
  company_name: string;
  description: string | null;
  created_at: string; // ISO format date string
  updated_at: string; // ISO format date string
  created_by: UserId;
  updated_by: UserId;
  // Add more fields as needed for company details
}

export interface LastEditInfo {
  email: string;
  first_name: string;
  last_name: string;
  id: UserId;
  timestamp: string;
}

// Request and Response Types

export type GetCompanyDetailsRequest = {
  id: CompanyId;
};

export type GetCompanyDetailsResponse = CompanyDetails;

export type CreateCompanyDetailsRequest = {
  company_name: string;
  description?: string;
};

export type CreateCompanyDetailsResponse = CompanyDetails;

export type UpdateCompanyDetailsRequest = {
  id: CompanyId;
  company_name?: string;
  description?: string;
};

export type UpdateCompanyDetailsResponse = CompanyDetails;

export interface ListCompanyDetailsRequest
  extends PaginationRequest,
    Partial<SortingOptions> {
  name?: string;
  created_by?: UserId;
}

export interface ListCompanyDetailsResponse extends PaginationResponse {
  data: CompanyDetails[];
}

export interface DeleteCompanyDetailsRequest {
  id: CompanyId;
}
