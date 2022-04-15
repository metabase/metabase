import { createMockDatabase } from "metabase-types/api/mocks";
import Database, { HydratedDatabaseProperties } from "../metadata/Database";

export function createMockDatabaseInstance(
  databaseProps?: Partial<Database>,
  hydratedProps?: Partial<HydratedDatabaseProperties>,
): Database {
  const database = new Database({
    ...createMockDatabase(),
    ...databaseProps,
  });

  return Object.assign(database, hydratedProps);
}
