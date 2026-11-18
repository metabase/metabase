import type { TableRole } from "metabase/metadata/table-structure";

import {
  getAdditivity,
  getFieldTypeOptions,
  isFieldTypeA,
} from "./field-types";
import { getRowNouns, inferTableSubject } from "./subject-inference";
import { type TableSubject, isSubjectA } from "./subjects";

interface SetupOpts {
  name: string;
  role?: TableRole | null;
  entityType?: string | null;
}

function setup({ name, role = null, entityType = null }: SetupOpts) {
  return inferTableSubject({ name, entity_type: entityType }, role);
}

describe("inferTableSubject", () => {
  it.each<[string, TableSubject]>([
    ["deal", "entity/OpportunityTable"],
    ["opportunities", "entity/OpportunityTable"],
    ["contact", "entity/ContactTable"],
    ["leads", "entity/ContactTable"],
    ["employee", "entity/EmployeeTable"],
    ["customers", "entity/CustomerTable"],
    ["dim_customers", "entity/CustomerTable"],
    ["users", "entity/UserTable"],
    ["people", "entity/PersonTable"],
    ["workspaces", "entity/OrganizationTable"],
    ["companies", "entity/CompanyTable"],
    ["products", "entity/ProductTable"],
    ["orders", "entity/TransactionTable"],
    ["invoice", "entity/TransactionTable"],
    ["order_lines", "entity/LineItemTable"],
    ["invoice_line_items", "entity/LineItemTable"],
    ["subscriptions", "entity/SubscriptionTable"],
    ["events", "entity/EventTable"],
    ["sms_messages", "entity/MessageTable"],
    ["calls", "entity/MessageTable"],
    ["sessions", "entity/SessionTable"],
    ["campaign", "entity/CampaignTable"],
    ["ad_groups", "entity/CampaignTable"],
    ["tickets", "entity/TicketTable"],
    ["incidents", "entity/TicketTable"],
    ["projects", "entity/ProjectTable"],
    ["stores", "entity/LocationTable"],
    ["devices", "entity/DeviceTable"],
    ["calendar", "entity/CalendarTable"],
    ["deal_history", "entity/OpportunityTable"],
  ])("reads %s as %s", (name, subject) => {
    expect(setup({ name })).toMatchObject({ subject, confidence: "high" });
  });

  it.each<[string, TableSubject]>([
    ["account", "entity/OrganizationTable"],
    ["team", "entity/OrganizationTable"],
    ["task", "entity/TicketTable"],
  ])("is unsure about the ambiguous name %s", (name, subject) => {
    expect(setup({ name })).toMatchObject({ subject, confidence: "low" });
  });

  it("is unsure when only a word before the last one matches", () => {
    expect(setup({ name: "ticket_metrics" })).toMatchObject({
      subject: "entity/TicketTable",
      confidence: "low",
    });
  });

  it("uses the role as a second signal", () => {
    expect(
      setup({ name: "dim_date", role: "role/DateDimension" }).subject,
    ).toBe("entity/CalendarTable");
    expect(
      setup({ name: "web_visits", role: "role/SessionFact" }).subject,
    ).toBe("entity/SessionTable");
    expect(
      setup({ name: "order_items", role: "role/ArrayChild" }).subject,
    ).toBe("entity/LineItemTable");
  });

  it.each<TableRole>([
    "role/Bridge",
    "role/SystemTable",
    "role/TranslationTable",
    "role/ConfigurationTable",
    "role/LookupDimension",
  ])("never sets a subject on a %s", (role) => {
    expect(setup({ name: "customer_tags", role })).toMatchObject({
      subject: null,
      confidence: "high",
    });
  });

  it("never sets a subject on extract views", () => {
    expect(setup({ name: "pvo_customer_extract" }).subject).toBeNull();
  });

  it("falls back to what sync set", () => {
    expect(
      setup({ name: "catalog_x", entityType: "entity/ProductTable" }).subject,
    ).toBe("entity/ProductTable");
    expect(
      setup({ name: "catalog_x", entityType: "entity/GenericTable" }).subject,
    ).toBeNull();
  });
});

describe("getRowNouns", () => {
  it.each([
    ["Deals", "deal", "deals"],
    ["People", "person", "people"],
    ["Support tickets", "support ticket", "support tickets"],
    ["Opportunity", "opportunity", "opportunities"],
    ["Addresses", "address", "addresses"],
  ])("names the rows of %s", (displayName, singular, plural) => {
    expect(getRowNouns(displayName)).toEqual({ singular, plural });
  });
});

describe("type hierarchies", () => {
  it("keeps the old subjects valid under the new ones", () => {
    expect(isSubjectA("entity/UserTable", "entity/PersonTable")).toBe(true);
    expect(isSubjectA("entity/CompanyTable", "entity/PersonTable")).toBe(false);
  });

  it("derives new field types from existing ones", () => {
    expect(isFieldTypeA("type/TenantKey", "type/FK")).toBe(true);
    expect(isFieldTypeA("type/UnitPrice", "type/Currency")).toBe(true);
    expect(isFieldTypeA("type/Rate", "type/Share")).toBe(true);
    expect(isFieldTypeA("type/Status", "type/Category")).toBe(true);
    expect(isFieldTypeA("type/Status", "type/FK")).toBe(false);
  });

  it.each([
    ["type/Currency", "additive"],
    ["type/Count", "additive"],
    ["type/Balance", "semi-additive"],
    ["type/UnitPrice", "non-additive"],
    ["type/Rate", "non-additive"],
    ["type/RangeBound", "range"],
    ["type/TenantKey", "not-a-measure"],
    ["type/SortOrder", "not-a-measure"],
    ["type/Status", null],
  ])("derives the additivity of %s", (type, additivity) => {
    expect(getAdditivity(type)).toBe(additivity);
  });

  it("offers only types that fit the column's base type", () => {
    const options = getFieldTypeOptions(
      { base_type: "type/Boolean", effective_type: "type/Boolean" },
      null,
    ).flatMap((group) => group.items.map((item) => item.value));
    expect(options).toContain("type/SoftDeleteFlag");
    expect(options).not.toContain("type/Currency");
    expect(options).not.toContain("type/CreationTimestamp");
  });
});
