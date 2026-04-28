import type { WorkspaceDatabaseStatus } from "metabase-types/api";
import { createMockWorkspaceDatabase } from "metabase-types/api/mocks";

import {
  isDatabaseDeprovisioning,
  isDatabaseProvisioned,
  isDatabaseProvisioning,
  isDatabaseUnprovisioned,
} from "./utils";

describe("workspaces utils", () => {
  it.each<[WorkspaceDatabaseStatus, boolean]>([
    ["provisioned", true],
    ["unprovisioned", false],
  ])("isDatabaseProvisioned(%s) -> %s", (status, expected) => {
    expect(isDatabaseProvisioned(createMockWorkspaceDatabase({ status }))).toBe(
      expected,
    );
  });

  it.each<[WorkspaceDatabaseStatus, boolean]>([
    ["provisioning", true],
    ["unprovisioned", false],
  ])("isDatabaseProvisioning(%s) -> %s", (status, expected) => {
    expect(
      isDatabaseProvisioning(createMockWorkspaceDatabase({ status })),
    ).toBe(expected);
  });

  it.each<[WorkspaceDatabaseStatus, boolean]>([
    ["deprovisioning", true],
    ["provisioned", false],
  ])("isDatabaseDeprovisioning(%s) -> %s", (status, expected) => {
    expect(
      isDatabaseDeprovisioning(createMockWorkspaceDatabase({ status })),
    ).toBe(expected);
  });

  it.each<[WorkspaceDatabaseStatus, boolean]>([
    ["unprovisioned", true],
    ["provisioned", false],
  ])("isDatabaseUnprovisioned(%s) -> %s", (status, expected) => {
    expect(
      isDatabaseUnprovisioned(createMockWorkspaceDatabase({ status })),
    ).toBe(expected);
  });
});
