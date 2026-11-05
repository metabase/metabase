import type { TableRole } from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field } from "metabase-types/api";
import { createMockField } from "metabase-types/api/mocks";

import { inferFieldType } from "./field-inference";
import type { TableSubject } from "./subjects";

const BASE_TYPES = {
  text: "type/Text",
  int: "type/Integer",
  float: "type/Float",
  datetime: "type/DateTime",
  date: "type/Date",
  bool: "type/Boolean",
} as const;

type BaseTypeName = keyof typeof BASE_TYPES;

let nextFieldId = 1;

function createField(
  name: string,
  baseType: BaseTypeName,
  opts: Partial<Field> = {},
): Field {
  const id = nextFieldId++;
  return createMockField({
    id,
    name,
    display_name: name,
    base_type: BASE_TYPES[baseType],
    effective_type: BASE_TYPES[baseType],
    semantic_type: null,
    ...opts,
  });
}

interface SetupOpts {
  field: Field;
  siblings?: Field[];
  role?: TableRole | null;
  getTargetSubject?: (field: Field) => TableSubject | null;
}

function setup({
  field,
  siblings = [],
  role = null,
  getTargetSubject,
}: SetupOpts) {
  return inferFieldType(field, {
    fields: [field, ...siblings],
    role,
    getTargetSubject,
  });
}

describe("inferFieldType", () => {
  describe("corpus seeds", () => {
    it.each<[string, BaseTypeName, string]>([
      ["phone", "text", "type/Phone"],
      ["mobile_phone_number", "text", "type/Phone"],
      ["external_id", "text", "type/ExternalID"],
      ["etag", "text", "type/Version"],
      ["valid_from", "datetime", "type/ValidFrom"],
      ["last_login_at", "datetime", "type/LastActivityTimestamp"],
      ["shipped_at", "datetime", "type/MilestoneTimestamp"],
      ["paid_at", "datetime", "type/MilestoneTimestamp"],
      ["due_date", "date", "type/EndTimestamp"],
      ["occurred_at", "datetime", "type/EventTimestamp"],
      ["timezone", "text", "type/TimeZone"],
      ["unit_amount", "int", "type/UnitPrice"],
      ["tax_rate", "float", "type/Rate"],
      ["ctr", "float", "type/Rate"],
      ["amount", "int", "type/Currency"],
      ["impressions", "int", "type/Count"],
      ["ticket_count", "int", "type/Count"],
      ["file_size", "int", "type/Bytes"],
      ["max_seats", "int", "type/RangeBound"],
      ["satisfaction_score", "float", "type/Score"],
      ["deal_stage", "text", "type/Status"],
      ["status", "text", "type/Status"],
      ["priority", "text", "type/Priority"],
      ["cancellation_reason", "text", "type/Reason"],
      ["channel", "text", "type/Channel"],
      ["locale", "text", "type/Locale"],
      ["color", "text", "type/Color"],
      ["tags", "text", "type/Tags"],
      ["is_deleted", "bool", "type/SoftDeleteFlag"],
      ["livemode", "bool", "type/TestDataFlag"],
      ["is_primary", "bool", "type/PrimaryFlag"],
      ["has_attachments", "bool", "type/Flag"],
      ["user_agent", "text", "type/UserAgent"],
      ["file_name", "text", "type/FilePath"],
      ["sort_order", "int", "type/SortOrder"],
      ["source_system", "text", "type/SourceSystem"],
    ])("classifies %s (%s) as %s", (name, baseType, expected) => {
      expect(setup({ field: createField(name, baseType) })?.semanticType).toBe(
        expected,
      );
    });

    it("needs a compatible base type", () => {
      expect(setup({ field: createField("amount", "text") })).toBeNull();
      expect(setup({ field: createField("status", "datetime") })).toBeNull();
    });

    it("returns nothing for a column no rule recognizes", () => {
      expect(setup({ field: createField("seats", "int") })).toBeNull();
    });
  });

  describe("tightened regexes", () => {
    it("reads start_* as the start of an interval, not creation", () => {
      const result = setup({
        field: createField("start_date", "date", {
          semantic_type: "type/CreationTimestamp",
        }),
      });
      expect(result?.semanticType).toBe("type/StartTimestamp");
    });

    it("reads number as a natural key, not a quantity", () => {
      expect(
        setup({ field: createField("invoice_number", "text") })?.semanticType,
      ).toBe("type/NaturalKey");
    });

    it("reads source_id as an external id, not a source", () => {
      expect(
        setup({ field: createField("source_id", "text") })?.semanticType,
      ).toBe("type/ExternalID");
    });

    it("reads exchange_rate as a rate, not a share", () => {
      expect(
        setup({ field: createField("exchange_rate", "float") })?.semanticType,
      ).toBe("type/Rate");
    });

    it.each<[string, BaseTypeName, string | null]>([
      ["duration", "int", "type/Duration"],
      ["operating_system", "text", "type/UserAgent"],
      ["created_by", "int", null],
      ["shared", "bool", "type/Flag"],
    ])("keeps %s from misfiring", (name, baseType, expected) => {
      expect(
        setup({ field: createField(name, baseType) })?.semanticType ?? null,
      ).toBe(expected);
    });
  });

  describe("pair rules", () => {
    it("reads *_type next to *_id as a polymorphic pair", () => {
      const ownerType = createField("owner_type", "text");
      const ownerId = createField("owner_id", "int");
      expect(
        setup({ field: ownerType, siblings: [ownerId] })?.semanticType,
      ).toBe("type/TypeDiscriminator");
      expect(
        setup({ field: ownerId, siblings: [ownerType] })?.semanticType,
      ).toBe("type/PolymorphicKey");
    });

    it("reads a lone type column as a weakly guessed kind", () => {
      const result = setup({ field: createField("event_type", "text") });
      expect(result?.semanticType).toBe("type/Kind");
      expect(result?.confidence).toBe("low");
    });

    it("is confident about currency only next to a money column", () => {
      const currency = createField("currency", "text");
      expect(
        setup({ field: currency, siblings: [createField("amount", "int")] }),
      ).toMatchObject({
        semanticType: "type/CurrencyCode",
        confidence: "high",
      });
      expect(setup({ field: currency })).toMatchObject({
        semanticType: "type/CurrencyCode",
        confidence: "low",
      });
    });

    it("pairs start and end timestamps", () => {
      const start = createField("start_time", "datetime");
      const end = createField("end_time", "datetime");
      expect(setup({ field: start, siblings: [end] })?.signal).toContain(
        "end_time",
      );
      expect(setup({ field: end, siblings: [start] })?.semanticType).toBe(
        "type/EndTimestamp",
      );
    });

    it("reads level and path next to a parent key as hierarchy columns", () => {
      const parent = createField("parent_id", "int");
      expect(
        setup({ field: createField("level", "int"), siblings: [parent] })
          ?.semanticType,
      ).toBe("type/HierarchyLevel");
      expect(
        setup({ field: createField("path", "text"), siblings: [parent] })
          ?.semanticType,
      ).toBe("type/HierarchyPath");
    });

    it("reads state next to address columns as a location", () => {
      const state = createField("state", "text");
      expect(
        setup({ field: state, siblings: [createField("city", "text")] })
          ?.semanticType,
      ).toBe("type/State");
      expect(setup({ field: state })).toMatchObject({
        semanticType: "type/Status",
        confidence: "low",
      });
    });
  });

  describe("declared keys and FK targets", () => {
    it("keeps a declared primary key over its name", () => {
      const result = setup({
        field: createField("code", "text", { semantic_type: "type/PK" }),
      });
      expect(result).toBeNull();
    });

    it("reads a date in a composite primary key as the snapshot period", () => {
      const day = createField("day", "date", { semantic_type: "type/PK" });
      const accountId = createField("account_id", "int", {
        semantic_type: "type/PK",
      });
      expect(setup({ field: day, siblings: [accountId] })).toMatchObject({
        semanticType: null,
        facets: { time: "type/PeriodKey" },
      });
    });

    it("reads a foreign key to its own table as a parent key", () => {
      const id = createField("id", "int", { semantic_type: "type/PK" });
      const managerId = createField("manager_id", "int", {
        semantic_type: "type/FK",
        fk_target_field_id: getRawTableFieldId(id),
      });
      expect(setup({ field: managerId, siblings: [id] })?.semanticType).toBe(
        "type/ParentKey",
      );
    });

    it("reads a foreign key to an accounts table as the tenant key", () => {
      const companyId = createField("company_id", "int", {
        semantic_type: "type/FK",
        fk_target_field_id: 9999,
      });
      expect(
        setup({
          field: companyId,
          getTargetSubject: () => "entity/OrganizationTable",
        })?.semanticType,
      ).toBe("type/TenantKey");
    });

    it("reads two foreign keys to the same table as role-playing keys", () => {
      const createdBy = createField("created_by_id", "int", {
        semantic_type: "type/FK",
        fk_target_field_id: 9998,
      });
      const assignee = createField("assignee_id", "int", {
        semantic_type: "type/FK",
        fk_target_field_id: 9998,
      });
      expect(
        setup({ field: createdBy, siblings: [assignee] })?.semanticType,
      ).toBe("type/RoleKey");
    });
  });

  describe("table context", () => {
    it("marks the only timestamp of an event table as the event time", () => {
      const result = setup({
        field: createField("created_at", "datetime"),
        siblings: [createField("user_id", "int")],
        role: "role/EventFact",
      });
      expect(result).toMatchObject({
        semanticType: "type/CreationTimestamp",
        facets: { time: "type/EventTimestamp" },
      });
    });

    it("reads active on a history table as the current-version flag", () => {
      expect(
        setup({
          field: createField("is_active", "bool"),
          role: "role/HistoryDimension",
        })?.semanticType,
      ).toBe("type/CurrentRowFlag");
    });

    it("reads the non-key id of a history table as the durable key", () => {
      expect(
        setup({
          field: createField("id", "int"),
          siblings: [
            createField("_fivetran_id", "text", { semantic_type: "type/PK" }),
          ],
          role: "role/HistoryDimension",
        })?.semanticType,
      ).toBe("type/DurableKey");
    });

    it("reads weight on a bridge as an allocation weight", () => {
      expect(
        setup({ field: createField("weight", "float"), role: "role/Bridge" })
          ?.semanticType,
      ).toBe("type/Weight");
      expect(setup({ field: createField("weight", "float") })).toBeNull();
    });

    it("reads a natural key on a fact as a document number", () => {
      expect(
        setup({
          field: createField("invoice_number", "text"),
          role: "role/TransactionFact",
        })?.semanticType,
      ).toBe("type/DegenerateDimension");
    });

    it("is confident about a balance on a periodic snapshot", () => {
      const balance = createField("balance", "float");
      expect(setup({ field: balance })?.confidence).toBe("low");
      expect(
        setup({ field: balance, role: "role/PeriodicSnapshotFact" })
          ?.confidence,
      ).toBe("high");
    });
  });

  describe("loader columns and facets", () => {
    it.each<[string, BaseTypeName, string]>([
      ["_fivetran_synced", "datetime", "type/LoadTimestamp"],
      ["_fivetran_deleted", "bool", "type/SoftDeleteFlag"],
      ["_fivetran_start", "datetime", "type/ValidFrom"],
      ["_fivetran_end", "datetime", "type/ValidTo"],
      ["_fivetran_active", "bool", "type/CurrentRowFlag"],
    ])("reads %s as %s and a loader column", (name, baseType, expected) => {
      expect(setup({ field: createField(name, baseType) })).toMatchObject({
        semanticType: expected,
        facets: { structure: "type/SystemColumn" },
        confidence: "high",
      });
    });

    it("reads other loader columns as loader columns", () => {
      expect(
        setup({ field: createField("_airbyte_ab_id", "text") })?.semanticType,
      ).toBe("type/SystemColumn");
    });

    it("keeps a custom property's meaning and adds the facet", () => {
      expect(
        setup({ field: createField("property_amount", "float") }),
      ).toMatchObject({
        semanticType: "type/Currency",
        facets: { structure: "type/CustomProperty" },
      });
    });
  });
});
