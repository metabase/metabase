import {
  createMockDatabase,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import Database from "metabase-lib/metadata/Database";
import { canRunAction } from "./utils";

describe("canRunAction", () => {
  it("should not be able to run an action if the user has no access to the database", () => {
    const action = createMockQueryAction();

    expect(canRunAction(action, [])).toBeFalsy();
  });

  it("should not be able to run an action if the database has readonly permissions", () => {
    const database = new Database(
      createMockDatabase({ native_permissions: "read" }),
    );
    const action = createMockQueryAction({ database_id: database.id });

    expect(canRunAction(action, [database])).toBeFalsy();
  });

  it("should be able to run an acton if the database has write permissions", () => {
    const database = new Database(
      createMockDatabase({ native_permissions: "write" }),
    );
    const action = createMockQueryAction({ database_id: database.id });

    expect(canRunAction(action, [database])).toBeTruthy();
  });
});
