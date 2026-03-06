import { match } from "ts-pattern";
import { t } from "ttag";

import type { DataSegregationStrategy } from "metabase/embedding/embedding-hub";

export type IsolationFieldConfig = {
  /** The attribute key sent to the API, e.g. organization_id */
  attributeKey: string;

  label: string;
  description: string;
  placeholder: string;
};

export const getIsolationFieldConfig = (
  strategy: DataSegregationStrategy | null | undefined,
): IsolationFieldConfig | null =>
  match(strategy)
    .with("row-column-level-security", () => ({
      attributeKey: "organization_id",
      label: "organization_id",
      description: t`Users will only see rows where this matches the value in the column you selected.`,
      placeholder: "1",
    }))
    .with("connection-impersonation", () => ({
      attributeKey: "database_role",
      label: "database_role",
      description: t`Users will access data based on the privileges granted to this role in the database.`,
      placeholder: "tenant_role",
    }))
    .with("database-routing", () => ({
      attributeKey: "database_slug",
      label: "database_slug",
      description: t`Match a slug for a destination DB as defined in the data source's DB routing settings.`,
      placeholder: "tenant-db-slug",
    }))
    .otherwise(() => null);
