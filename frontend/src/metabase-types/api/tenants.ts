import type { UserAttributeMap } from "./user";

export type Tenant = {
  id: number;
  name: string;
  slug: string;
  member_count: number;
  is_active: boolean;
  attributes: UserAttributeMap | null;
  tenant_collection_id: number | null;
  /** Image data URI. Only returned by `GET /api/ee/tenant/:id`, not by the list endpoint. */
  pdf_export_logo?: string | null;
};

export type CreateTenantInput = Pick<Tenant, "name" | "slug"> &
  Partial<Pick<Tenant, "attributes" | "pdf_export_logo">>;

export type UpdateTenantInput = Pick<Tenant, "id"> &
  Partial<
    Pick<Tenant, "name" | "is_active" | "attributes" | "pdf_export_logo">
  >;
