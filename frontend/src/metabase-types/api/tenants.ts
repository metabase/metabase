export type Tenant = {
  id: number;
  name: string;
  slug: string;
  userCount: number; // TODO: rename
  is_active: boolean;
};

export type CreateTenantInput = Pick<Tenant, "name" | "slug">;

export type UpdateTenantInput = Pick<Tenant, "id"> &
  Partial<Pick<Tenant, "name" | "is_active">>;
