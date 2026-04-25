import { type ReactNode, isValidElement } from "react";

import { getDataPermissionsDescription } from "./TenantsSummaryOnboardingStep";

type Input = Parameters<typeof getDataPermissionsDescription>[0];

const TENANT_NAME = "Acme Corp";
const TENANT_VALUE = "42";

const TEST_CASES: { name: string; input: Input; expected: string | null }[] = [
  {
    name: "RLS with one table",
    input: {
      strategy: "row-column-level-security",
      tenantName: TENANT_NAME,
      tenantValue: TENANT_VALUE,
      tableNames: ["Orders"],
      columnName: "company_id",
    },
    expected:
      "All users in Acme Corp can view rows in the Orders table where company_id field equals 42.",
  },
  {
    name: "RLS with two tables",
    input: {
      strategy: "row-column-level-security",
      tenantName: TENANT_NAME,
      tenantValue: TENANT_VALUE,
      tableNames: ["Orders", "Products"],
      columnName: "company_id",
    },
    expected:
      "All users in Acme Corp can view rows in the Orders and Products tables where company_id field equals 42.",
  },
  {
    name: "RLS with three tables (Oxford comma)",
    input: {
      strategy: "row-column-level-security",
      tenantName: TENANT_NAME,
      tenantValue: TENANT_VALUE,
      tableNames: ["Orders", "Products", "Reviews"],
      columnName: "company_id",
    },
    expected:
      "All users in Acme Corp can view rows in the Orders, Products, and Reviews tables where company_id field equals 42.",
  },
  {
    name: "RLS with empty tableNames → null",
    input: {
      strategy: "row-column-level-security",
      tenantName: TENANT_NAME,
      tenantValue: TENANT_VALUE,
      tableNames: [],
      columnName: "company_id",
    },
    expected: null,
  },
  {
    name: "RLS with null columnName → null",
    input: {
      strategy: "row-column-level-security",
      tenantName: TENANT_NAME,
      tenantValue: TENANT_VALUE,
      tableNames: ["Orders"],
      columnName: null,
    },
    expected: null,
  },
  {
    name: "connection-impersonation",
    input: {
      strategy: "connection-impersonation",
      tenantName: TENANT_NAME,
      tenantValue: "acme_role",
      tableNames: [],
      columnName: null,
    },
    expected:
      "All users in Acme Corp will connect using the acme_role database role.",
  },
  {
    name: "database-routing",
    input: {
      strategy: "database-routing",
      tenantName: TENANT_NAME,
      tenantValue: "acme-db",
      tableNames: [],
      columnName: null,
    },
    expected: "All users in Acme Corp will be routed to the acme-db database.",
  },
  {
    name: "empty tenantValue → null",
    input: {
      strategy: "connection-impersonation",
      tenantName: TENANT_NAME,
      tenantValue: "",
      tableNames: [],
      columnName: null,
    },
    expected: null,
  },
  {
    name: "unknown strategy → null",
    input: {
      strategy: null,
      tenantName: TENANT_NAME,
      tenantValue: TENANT_VALUE,
      tableNames: [],
      columnName: null,
    },
    expected: null,
  },
];

describe("getDataPermissionsDescription", () => {
  it.each(TEST_CASES)("$name", ({ input, expected }) => {
    expect(textFromReactNode(getDataPermissionsDescription(input))).toBe(
      expected,
    );
  });
});

/** Extracts plain text from a ReactNode, ignoring formatting elements. */
function textFromReactNode(node: ReactNode): string | null {
  if (node === null) {
    return null;
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((n) => textFromReactNode(n) ?? "").join("");
  }

  if (isValidElement(node)) {
    return textFromReactNode(node.props.children) ?? "";
  }

  return "";
}
