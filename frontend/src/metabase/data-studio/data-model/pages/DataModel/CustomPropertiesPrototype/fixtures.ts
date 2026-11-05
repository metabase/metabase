import type {
  Database,
  Field,
  FieldValue,
  GetFieldValuesResponse,
  Table,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockFieldValues,
  createMockTable,
} from "metabase-types/api/mocks";

export const WAREHOUSE_ID = 7;
export const CUSTOMERS_ID = 71;
export const CUSTOMER_PROPERTIES_ID = 72;
export const ORDERS_ID = 73;
export const CUSTOM_FIELD_ID = 75;
export const DEALS_ID = 76;
export const DEAL_PROPERTY_ID = 77;

export const CUSTOMERS_ID_FIELD_ID = 7101;
export const PROPERTY_CUSTOMER_ID_FIELD_ID = 7201;
export const PROPERTY_FIELD_ID_FIELD_ID = 7202;
export const PROPERTY_VALUE_FIELD_ID = 7203;
export const CUSTOM_FIELD_ID_FIELD_ID = 7501;
export const CUSTOM_FIELD_NAME_FIELD_ID = 7502;
export const CUSTOM_FIELD_TITLE_FIELD_ID = 7503;
export const CUSTOM_FIELD_TYPE_FIELD_ID = 7504;
export const DEAL_AMOUNT_FIELD_ID = 7603;
export const DEAL_SEATS_REQUESTED_FIELD_ID = 7609;
export const DEAL_PROPERTY_NAME_FIELD_ID = 7701;
export const DEAL_PROPERTY_LABEL_FIELD_ID = 7702;
export const DEAL_PROPERTY_TYPE_FIELD_ID = 7703;
type FieldSpec = Partial<Field> & Pick<Field, "id" | "name" | "display_name">;

function createFields(tableId: number, specs: FieldSpec[]): Field[] {
  return specs.map((spec, index) =>
    createMockField({
      table_id: tableId,
      position: index,
      base_type: "type/Text",
      effective_type: "type/Text",
      database_type: "text",
      semantic_type: null,
      ...spec,
    }),
  );
}

const customersFields = createFields(CUSTOMERS_ID, [
  {
    id: CUSTOMERS_ID_FIELD_ID,
    name: "id",
    display_name: "ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    database_type: "int4",
    semantic_type: "type/PK",
  },
  {
    id: 7102,
    name: "name",
    display_name: "Name",
    semantic_type: "type/Name",
  },
  {
    id: 7103,
    name: "email",
    display_name: "Email",
    semantic_type: "type/Email",
  },
  {
    id: 7104,
    name: "country",
    display_name: "Country",
    semantic_type: "type/Country",
    has_field_values: "list",
  },
  {
    id: 7105,
    name: "created_at",
    display_name: "Created at",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    database_type: "timestamp",
    semantic_type: "type/CreationTimestamp",
  },
]);

const customFieldValueFields = createFields(CUSTOMER_PROPERTIES_ID, [
  {
    id: PROPERTY_CUSTOMER_ID_FIELD_ID,
    name: "customer_id",
    display_name: "Customer ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    database_type: "int4",
    semantic_type: "type/FK",
    fk_target_field_id: CUSTOMERS_ID_FIELD_ID,
  },
  {
    id: PROPERTY_FIELD_ID_FIELD_ID,
    name: "custom_field_id",
    display_name: "Custom field ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    database_type: "int4",
    semantic_type: "type/FK",
    fk_target_field_id: CUSTOM_FIELD_ID_FIELD_ID,
  },
  {
    id: PROPERTY_VALUE_FIELD_ID,
    name: "value",
    display_name: "Value",
    has_field_values: "search",
  },
]);

const customFieldFields = createFields(CUSTOM_FIELD_ID, [
  {
    id: CUSTOM_FIELD_ID_FIELD_ID,
    name: "id",
    display_name: "ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    database_type: "int4",
    semantic_type: "type/PK",
  },
  {
    id: CUSTOM_FIELD_NAME_FIELD_ID,
    name: "name",
    display_name: "Name",
  },
  {
    id: CUSTOM_FIELD_TITLE_FIELD_ID,
    name: "title",
    display_name: "Title",
    semantic_type: "type/Title",
  },
  {
    id: CUSTOM_FIELD_TYPE_FIELD_ID,
    name: "field_type",
    display_name: "Field type",
    semantic_type: "type/Category",
    has_field_values: "list",
  },
]);

const dealsFields = createFields(DEALS_ID, [
  {
    id: 7601,
    name: "id",
    display_name: "ID",
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    database_type: "int8",
    semantic_type: "type/PK",
  },
  {
    id: 7602,
    name: "property_dealname",
    display_name: "Deal name",
    semantic_type: "type/Name",
  },
  {
    id: DEAL_AMOUNT_FIELD_ID,
    name: "property_amount",
    display_name: "Amount",
    base_type: "type/Decimal",
    effective_type: "type/Decimal",
    database_type: "numeric",
    semantic_type: "type/Currency",
  },
  {
    id: 7604,
    name: "property_createdate",
    display_name: "Create date",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    database_type: "timestamp",
    semantic_type: "type/CreationTimestamp",
  },
  {
    id: 7605,
    name: "property_dealstage",
    display_name: "Deal stage",
    semantic_type: "type/Category",
  },
  {
    id: 7606,
    name: "property_lead_src_c",
    display_name: "Lead source",
    semantic_type: "type/Category",
  },
  {
    id: 7607,
    name: "property_partner_referral",
    display_name: "Partner referral",
    base_type: "type/Boolean",
    effective_type: "type/Boolean",
    database_type: "bool",
  },
  {
    id: 7608,
    name: "property_implementation_start",
    display_name: "Implementation start",
    base_type: "type/Date",
    effective_type: "type/Date",
    database_type: "date",
  },
  {
    id: DEAL_SEATS_REQUESTED_FIELD_ID,
    name: "property_seats_requested",
    display_name: "Requested seats",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    database_type: "int4",
    semantic_type: "type/Quantity",
  },
  {
    id: 7610,
    name: "property_hs_legacy_score",
    display_name: "Property hs legacy score",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    database_type: "int4",
    semantic_type: "type/Score",
  },
]);

const dealPropertyFields = createFields(DEAL_PROPERTY_ID, [
  {
    id: DEAL_PROPERTY_NAME_FIELD_ID,
    name: "name",
    display_name: "Name",
  },
  {
    id: DEAL_PROPERTY_LABEL_FIELD_ID,
    name: "label",
    display_name: "Label",
  },
  {
    id: DEAL_PROPERTY_TYPE_FIELD_ID,
    name: "type",
    display_name: "Type",
    semantic_type: "type/Category",
  },
]);

const ordersFields = createFields(ORDERS_ID, [
  {
    id: 7301,
    name: "id",
    display_name: "ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    database_type: "int4",
    semantic_type: "type/PK",
  },
  {
    id: 7302,
    name: "customer_id",
    display_name: "Customer ID",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    database_type: "int4",
    semantic_type: "type/FK",
    fk_target_field_id: CUSTOMERS_ID_FIELD_ID,
  },
  {
    id: 7303,
    name: "total",
    display_name: "Total",
    base_type: "type/Decimal",
    effective_type: "type/Decimal",
    database_type: "numeric",
    semantic_type: "type/Currency",
  },
  {
    id: 7304,
    name: "created_at",
    display_name: "Created at",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    database_type: "timestamp",
    semantic_type: "type/CreationTimestamp",
  },
]);

export function createWarehouse(): Database {
  const tables: Table[] = [
    createMockTable({
      id: CUSTOMERS_ID,
      db_id: WAREHOUSE_ID,
      schema: "public",
      name: "customers",
      display_name: "Customers",
      entity_type: "entity/UserTable",
      fields: customersFields,
      estimated_row_count: 2480,
    }),
    createMockTable({
      id: CUSTOMER_PROPERTIES_ID,
      db_id: WAREHOUSE_ID,
      schema: "public",
      name: "custom_field_value",
      display_name: "Custom field values",
      entity_type: "entity/GenericTable",
      fields: customFieldValueFields,
      estimated_row_count: 18464,
    }),
    createMockTable({
      id: CUSTOM_FIELD_ID,
      db_id: WAREHOUSE_ID,
      schema: "public",
      name: "custom_field",
      display_name: "Custom fields",
      entity_type: "entity/GenericTable",
      fields: customFieldFields,
      estimated_row_count: 14,
    }),
    createMockTable({
      id: DEALS_ID,
      db_id: WAREHOUSE_ID,
      schema: "public",
      name: "deals",
      display_name: "Deals",
      entity_type: "entity/GenericTable",
      fields: dealsFields,
      estimated_row_count: 5130,
    }),
    createMockTable({
      id: DEAL_PROPERTY_ID,
      db_id: WAREHOUSE_ID,
      schema: "public",
      name: "deal_property",
      display_name: "Deal properties",
      entity_type: "entity/GenericTable",
      fields: dealPropertyFields,
      estimated_row_count: 9,
    }),
    createMockTable({
      id: ORDERS_ID,
      db_id: WAREHOUSE_ID,
      schema: "public",
      name: "orders",
      display_name: "Orders",
      entity_type: "entity/TransactionTable",
      fields: ordersFields,
      estimated_row_count: 61840,
    }),
  ];
  return createMockDatabase({
    id: WAREHOUSE_ID,
    name: "Warehouse",
    engine: "postgres",
    transforms_permissions: "write",
    tables,
  });
}

const values = (...items: string[]): FieldValue[] =>
  items.map((item) => [item]);

export const WAREHOUSE_FIELD_VALUES: GetFieldValuesResponse[] = [
  createMockFieldValues({
    field_id: 7104,
    values: values("Canada", "Germany", "Japan", "United Kingdom", "USA"),
  }),
  createMockFieldValues({
    field_id: CUSTOM_FIELD_TYPE_FIELD_ID,
    values: values(
      "checkbox",
      "currency",
      "date",
      "dropdown",
      "number",
      "text",
    ),
  }),
];

export const CURATED_REGISTRY = {
  [`${WAREHOUSE_ID}:${CUSTOMER_PROPERTIES_ID}`]: {
    plan: { description: "The customer's current billing plan" },
    seats: {
      description: "Paid seats on the customer's current contract",
      synonyms: ["licenses", "users"],
    },
    mrr_usd: {
      description: "Monthly recurring revenue in US dollars",
      synonyms: ["revenue"],
    },
    csm_email: {
      description: "Customer success manager who owns the account",
    },
  },
};

export const EMPTY_TABLE_STRUCTURE = { tables: {}, grainByField: {} };
