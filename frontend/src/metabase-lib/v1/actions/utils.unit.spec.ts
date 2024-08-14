import { createMockMetadata } from "__support__/metadata";
import type { WritebackAction, Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { canRunAction } from "./utils";

interface SetupOpts {
  database?: Database;
  action?: WritebackAction;
}

const setup = ({
  database = createMockDatabase(),
  action = createMockQueryAction({ database_id: database.id }),
}: SetupOpts = {}) => {
  const metadata = createMockMetadata({ databases: [database] });
  const db = metadata.database(database.id);
  if (!db) {
    throw new Error();
  }

  return { action, database: db };
};

describe("canRunAction", () => {
  it("should not be able to run an action if the user has no access to the database", () => {
    const { action } = setup();

    expect(canRunAction(action, [])).toBe(false);
  });

  it("should not be able to run an action if the database has actions disabled", () => {
    const { database, action } = setup({
      database: createMockDatabase({
        native_permissions: "write",
        settings: { "database-enable-actions": false },
      }),
    });

    expect(canRunAction(action, [database])).toBe(false);
  });

  it("should be able to run an action if the database has actions enabled", () => {
    const { database, action } = setup({
      database: createMockDatabase({
        native_permissions: "write",
        settings: { "database-enable-actions": true },
      }),
    });

    expect(canRunAction(action, [database])).toBe(true);
  });
});
