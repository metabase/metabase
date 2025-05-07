export type Tenant = {
  id: number;
  name: string;
  slug: string;
  member_count: number;
  is_active: boolean;
};

export type CreateTenantInput = Pick<Tenant, "name" | "slug">;

export type UpdateTenantInput = Pick<Tenant, "id"> &
  Partial<Pick<Tenant, "name" | "is_active">>;
