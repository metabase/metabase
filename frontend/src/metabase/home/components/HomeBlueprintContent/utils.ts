import {
  DATABASE_BLUEPRINTS,
  type Database,
  type DatabaseBlueprint,
} from "metabase-types/api";

const SERVICE_NAME_BY_BLUEPRINT: Record<DatabaseBlueprint, string> = {
  "is-salesforce?": "Salesforce",
  "is-stripe?": "Stripe",
};

export const getServiceNameByBlueprint = (blueprint: DatabaseBlueprint) => {
  return SERVICE_NAME_BY_BLUEPRINT[blueprint];
};

export const hasAvailableBlueprints = (databases: Database[]) => {
  return databases.some((database) =>
    DATABASE_BLUEPRINTS.some((key) => {
      const blueprintsData = database.settings?.blueprints;
      const blueprint = blueprintsData?.[key];

      return blueprint != null && !blueprintsData?.["blueprinted"];
    }),
  );
};
