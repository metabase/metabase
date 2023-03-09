import {
  createMockDatabase,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import Database from "metabase-lib/metadata/Database";
import { canRunAction } from "./utils";

describe("canRunAction", () => {
  it("should not be able to run an action if the user has no access to the database", () => {
    const action = createMockQueryAction();

    expect(canRunAction(action, [])).toBe(false);
  });

  it("should not be able to run an action if the database has actions disabled", () => {
    const database = new Database(
      createMockDatabase({
        native_permissions: "write",
        settings: { "database-enable-actions": false },
      }),
    );
    const action = createMockQueryAction({ database_id: database.id });

    expect(canRunAction(action, [database])).toBe(false);
  });

  it("should be able to run an action if the database has actions enabled", () => {
    const database = new Database(
      createMockDatabase({
        native_permissions: "read",
        settings: { "database-enable-actions": true },
      }),
    );
    const action = createMockQueryAction({ database_id: database.id });

    expect(canRunAction(action, [database])).toBe(true);
  });
});
