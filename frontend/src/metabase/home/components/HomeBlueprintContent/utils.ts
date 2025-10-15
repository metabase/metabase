import {
  DATABASE_BLUEPRINTS,
  type Database,
  type DatabaseBlueprintKey,
  type DatabaseBlueprintName,
} from "metabase-types/api";

const SERVICE_BY_BLUEPRINT_KEY: Record<
  DatabaseBlueprintKey,
  DatabaseBlueprintName
> = {
  "is-salesforce?": "salesforce",
  "is-stripe?": "stripe",
} as const;

const getDatabasesWithBlueprints = (databases: Database[]) => {
  return databases.filter((database) =>
    DATABASE_BLUEPRINTS.some((key) => database.settings?.blueprints?.[key]),
  );
};

export const hasAvailableBlueprints = (databases: Database[]) => {
  const databasesWithBlueprints = getDatabasesWithBlueprints(databases);
  return databasesWithBlueprints.length > 0;
};

export const getAvailableBlueprint = (
  databases: Database[],
): {
  database: Database;
  service: DatabaseBlueprintName;
} => {
  const database = databases.find((database) =>
    DATABASE_BLUEPRINTS.some((key) => {
      const blueprintsData = database.settings?.blueprints;
      const blueprint = blueprintsData?.[key];

      return blueprint != null && !blueprintsData?.["blueprinted"];
    }),
  )!;

  return {
    database,
    service:
      SERVICE_BY_BLUEPRINT_KEY[
        DATABASE_BLUEPRINTS.find(
          (key) => database?.settings?.blueprints?.[key],
        )!
      ],
  };
};
