import type { Database, Field, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

export const WAREHOUSE_ID = 8;

const BASE_TYPES = {
  int: ["type/Integer", "int8"],
  float: ["type/Float", "float8"],
  text: ["type/Text", "varchar"],
  bool: ["type/Boolean", "boolean"],
  date: ["type/Date", "date"],
  datetime: ["type/DateTime", "timestamp"],
} as const;

type BaseTypeName = keyof typeof BASE_TYPES;

type FieldSpec = [
  name: string,
  baseType: BaseTypeName,
  opts?: { pk?: boolean; fk?: string; semanticType?: string },
];

type TableSpec = {
  id: number;
  schema: string;
  name: string;
  displayName: string;
  entityType?: string;
  rows: number;
  fields: FieldSpec[];
};

const LOADER_FIELDS: FieldSpec[] = [
  ["_fivetran_synced", "datetime"],
  ["_fivetran_deleted", "bool"],
];

const TABLE_SPECS: TableSpec[] = [
  {
    id: 81,
    schema: "hubspot",
    name: "deal",
    displayName: "Deals",
    rows: 5130,
    fields: [
      ["deal_id", "int", { pk: true }],
      ["deal_name", "text"],
      ["amount", "float"],
      ["currency", "text"],
      ["deal_stage", "text", { semanticType: "type/Category" }],
      ["pipeline", "text", { semanticType: "type/Category" }],
      ["close_date", "date"],
      ["created_at", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["owner_id", "int", { fk: "hubspot.owner.owner_id" }],
      ["company_id", "int", { fk: "hubspot.company.company_id" }],
      ["property_hs_forecast_amount", "float"],
      ["property_hs_is_closed_won", "bool"],
      ...LOADER_FIELDS,
    ],
  },
  {
    id: 82,
    schema: "hubspot",
    name: "company",
    displayName: "Companies",
    entityType: "entity/CompanyTable",
    rows: 1230,
    fields: [
      ["company_id", "int", { pk: true }],
      ["name", "text", { semanticType: "type/Name" }],
      ["domain", "text"],
      ["industry", "text"],
      ["city", "text", { semanticType: "type/City" }],
      ["state", "text", { semanticType: "type/State" }],
      ["country", "text", { semanticType: "type/Country" }],
      ["phone", "text"],
      ["annual_revenue", "float"],
      ["created_at", "datetime", { semanticType: "type/CreationTimestamp" }],
      ...LOADER_FIELDS,
    ],
  },
  {
    id: 83,
    schema: "hubspot",
    name: "contact",
    displayName: "Contacts",
    entityType: "entity/UserTable",
    rows: 9804,
    fields: [
      ["contact_id", "int", { pk: true }],
      ["email", "text", { semanticType: "type/Email" }],
      ["first_name", "text"],
      ["last_name", "text"],
      ["phone_number", "text", { semanticType: "type/Quantity" }],
      ["lifecycle_stage", "text"],
      ["lead_source", "text", { semanticType: "type/Source" }],
      ["company_id", "int", { fk: "hubspot.company.company_id" }],
      ["last_activity_date", "datetime"],
      ["created_at", "datetime", { semanticType: "type/CreationTimestamp" }],
      ...LOADER_FIELDS,
    ],
  },
  {
    id: 84,
    schema: "hubspot",
    name: "owner",
    displayName: "Owners",
    entityType: "entity/UserTable",
    rows: 48,
    fields: [
      ["owner_id", "int", { pk: true }],
      ["email", "text", { semanticType: "type/Email" }],
      ["first_name", "text"],
      ["last_name", "text"],
      ["is_active", "bool"],
      ["created_at", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["_fivetran_synced", "datetime"],
    ],
  },
  {
    id: 85,
    schema: "hubspot",
    name: "deal_contact",
    displayName: "Deal contacts",
    rows: 14210,
    fields: [
      ["deal_id", "int", { pk: true, fk: "hubspot.deal.deal_id" }],
      ["contact_id", "int", { pk: true, fk: "hubspot.contact.contact_id" }],
    ],
  },
  {
    id: 86,
    schema: "stripe",
    name: "charge",
    displayName: "Charges",
    entityType: "entity/TransactionTable",
    rows: 61840,
    fields: [
      ["id", "text", { pk: true }],
      ["amount", "int", { semanticType: "type/Currency" }],
      ["amount_refunded", "int"],
      ["currency", "text"],
      ["status", "text", { semanticType: "type/Category" }],
      ["description", "text", { semanticType: "type/Description" }],
      ["customer_id", "text", { fk: "stripe.customer.id" }],
      ["invoice_id", "text", { fk: "stripe.invoice.id" }],
      ["source_id", "text", { semanticType: "type/Source" }],
      ["livemode", "bool"],
      ["created", "datetime", { semanticType: "type/CreationTimestamp" }],
      ...LOADER_FIELDS,
    ],
  },
  {
    id: 87,
    schema: "stripe",
    name: "invoice",
    displayName: "Invoices",
    rows: 18420,
    fields: [
      ["id", "text", { pk: true }],
      ["number", "text", { semanticType: "type/Quantity" }],
      ["customer_id", "text", { fk: "stripe.customer.id" }],
      ["subtotal", "int"],
      ["tax", "int"],
      ["total", "int"],
      ["currency", "text"],
      ["status", "text"],
      ["period_start", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["period_end", "datetime"],
      ["due_date", "datetime"],
      ["created", "datetime", { semanticType: "type/CreationTimestamp" }],
      ...LOADER_FIELDS,
    ],
  },
  {
    id: 88,
    schema: "stripe",
    name: "invoice_line_item",
    displayName: "Invoice line items",
    rows: 40210,
    fields: [
      ["id", "text", { pk: true }],
      ["invoice_id", "text", { fk: "stripe.invoice.id" }],
      ["amount", "int"],
      ["quantity", "int", { semanticType: "type/Quantity" }],
      ["unit_amount", "int"],
      ["description", "text"],
      ["proration", "bool"],
      ["_fivetran_synced", "datetime"],
    ],
  },
  {
    id: 89,
    schema: "stripe",
    name: "customer",
    displayName: "Customers",
    entityType: "entity/UserTable",
    rows: 2480,
    fields: [
      ["id", "text", { pk: true }],
      ["email", "text", { semanticType: "type/Email" }],
      ["name", "text", { semanticType: "type/Name" }],
      ["phone", "text"],
      ["balance", "int"],
      ["currency", "text"],
      ["delinquent", "bool"],
      ["created", "datetime", { semanticType: "type/CreationTimestamp" }],
      ...LOADER_FIELDS,
    ],
  },
  {
    id: 90,
    schema: "stripe",
    name: "balance_transaction",
    displayName: "Balance transactions",
    rows: 210400,
    fields: [
      ["id", "text", { pk: true }],
      ["amount", "int"],
      ["fee", "int"],
      ["net", "int"],
      ["exchange_rate", "float", { semanticType: "type/Share" }],
      ["type", "text"],
      ["reporting_category", "text"],
      ["source_id", "text"],
      ["source_type", "text"],
      ["created", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["available_on", "datetime"],
      ["_fivetran_synced", "datetime"],
    ],
  },
  {
    id: 91,
    schema: "stripe",
    name: "subscription",
    displayName: "Subscriptions",
    entityType: "entity/SubscriptionTable",
    rows: 3120,
    fields: [
      ["id", "text", { pk: true }],
      ["customer_id", "text", { fk: "stripe.customer.id" }],
      ["status", "text", { semanticType: "type/Category" }],
      ["start_date", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["current_period_start", "datetime"],
      ["current_period_end", "datetime"],
      ["canceled_at", "datetime"],
      ["cancellation_reason", "text"],
      ["cancel_at_period_end", "bool"],
      ...LOADER_FIELDS,
    ],
  },
  {
    id: 92,
    schema: "stripe",
    name: "customer_balance_daily",
    displayName: "Customer balance daily",
    rows: 905200,
    fields: [
      ["date", "date", { pk: true }],
      ["customer_id", "text", { pk: true, fk: "stripe.customer.id" }],
      ["balance", "int"],
      ["mrr", "int"],
      ["currency", "text"],
    ],
  },
  {
    id: 93,
    schema: "zendesk",
    name: "ticket",
    displayName: "Tickets",
    rows: 48210,
    fields: [
      ["id", "int", { pk: true }],
      ["subject", "text"],
      ["description", "text", { semanticType: "type/Description" }],
      ["status", "text", { semanticType: "type/Category" }],
      ["priority", "text", { semanticType: "type/Category" }],
      ["type", "text", { semanticType: "type/Category" }],
      ["via_channel", "text"],
      ["requester_id", "int", { fk: "zendesk.user.id" }],
      ["assignee_id", "int", { fk: "zendesk.user.id" }],
      ["organization_id", "int", { fk: "zendesk.organization.id" }],
      ["group_id", "int", { fk: "zendesk.group.id" }],
      ["tags", "text"],
      ["first_reply_time_minutes", "int"],
      ["created_at", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["updated_at", "datetime"],
      ["due_at", "datetime"],
      ["_fivetran_synced", "datetime"],
    ],
  },
  {
    id: 94,
    schema: "zendesk",
    name: "user",
    displayName: "Users",
    entityType: "entity/UserTable",
    rows: 9120,
    fields: [
      ["id", "int", { pk: true }],
      ["name", "text", { semanticType: "type/Name" }],
      ["email", "text", { semanticType: "type/Email" }],
      ["phone", "text"],
      ["role", "text"],
      ["locale", "text"],
      ["time_zone", "text"],
      ["organization_id", "int", { fk: "zendesk.organization.id" }],
      ["external_id", "text"],
      ["last_login_at", "datetime"],
      ["active", "bool"],
      ["created_at", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["_fivetran_synced", "datetime"],
    ],
  },
  {
    id: 95,
    schema: "zendesk",
    name: "organization",
    displayName: "Organizations",
    rows: 1180,
    fields: [
      ["id", "int", { pk: true }],
      ["name", "text", { semanticType: "type/Name" }],
      ["external_id", "text"],
      ["tags", "text"],
      ["created_at", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["_fivetran_synced", "datetime"],
    ],
  },
  {
    id: 96,
    schema: "zendesk",
    name: "group",
    displayName: "Groups",
    rows: 24,
    fields: [
      ["id", "int", { pk: true }],
      ["name", "text", { semanticType: "type/Name" }],
      ["created_at", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["updated_at", "datetime"],
      ["_fivetran_synced", "datetime"],
    ],
  },
  {
    id: 97,
    schema: "zendesk",
    name: "ticket_comment",
    displayName: "Ticket comments",
    rows: 212400,
    fields: [
      ["id", "int", { pk: true }],
      ["ticket_id", "int", { fk: "zendesk.ticket.id" }],
      ["user_id", "int", { fk: "zendesk.user.id" }],
      ["body", "text"],
      ["public", "bool"],
      ["created", "datetime", { semanticType: "type/CreationTimestamp" }],
      ["_fivetran_synced", "datetime"],
    ],
  },
];

const getFieldId = (tableId: number, index: number) =>
  tableId * 100 + index + 1;

const humanize = (name: string) => {
  const words = name.replace(/^_+/, "").split("_").filter(Boolean);
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
};

function getFieldIdByPath(): Map<string, number> {
  return new Map(
    TABLE_SPECS.flatMap((table) =>
      table.fields.map(([name], index) => [
        `${table.schema}.${table.name}.${name}`,
        getFieldId(table.id, index),
      ]),
    ),
  );
}

function createFields(table: TableSpec, fieldIdByPath: Map<string, number>) {
  return table.fields.map(([name, baseType, opts = {}], index): Field => {
    const [type, databaseType] = BASE_TYPES[baseType];
    const targetId = opts.fk != null ? fieldIdByPath.get(opts.fk) : undefined;
    const keyType = opts.pk ? "type/PK" : null;
    return createMockField({
      id: getFieldId(table.id, index),
      table_id: table.id,
      position: index,
      name,
      display_name: humanize(name),
      base_type: type,
      effective_type: type,
      database_type: databaseType,
      semantic_type:
        targetId != null ? "type/FK" : (keyType ?? opts.semanticType ?? null),
      fk_target_field_id: targetId ?? null,
    });
  });
}

export function createWarehouse(): Database {
  const fieldIdByPath = getFieldIdByPath();
  const tables: Table[] = TABLE_SPECS.map((table) =>
    createMockTable({
      id: table.id,
      db_id: WAREHOUSE_ID,
      schema: table.schema,
      name: table.name,
      display_name: table.displayName,
      entity_type: table.entityType ?? "entity/GenericTable",
      fields: createFields(table, fieldIdByPath),
      estimated_row_count: table.rows,
    }),
  );
  return createMockDatabase({
    id: WAREHOUSE_ID,
    name: "Fivetran warehouse",
    engine: "snowflake",
    tables,
  });
}

export function getFixtureTable(schema: string, name: string) {
  const table = TABLE_SPECS.find(
    (spec) => spec.schema === schema && spec.name === name,
  );
  if (table == null) {
    throw new Error(`No fixture table ${schema}.${name}`);
  }
  return { id: table.id, schema: table.schema };
}

export function getFixtureFieldId(
  schema: string,
  tableName: string,
  fieldName: string,
): number {
  const fieldId = getFieldIdByPath().get(`${schema}.${tableName}.${fieldName}`);
  if (fieldId == null) {
    throw new Error(`No fixture field ${schema}.${tableName}.${fieldName}`);
  }
  return fieldId;
}
