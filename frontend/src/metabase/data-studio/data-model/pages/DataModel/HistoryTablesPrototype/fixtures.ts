import type {
  Database,
  Dataset,
  Field,
  FieldValue,
  GetFieldValuesResponse,
  RowValue,
  Table,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockField,
  createMockFieldValues,
  createMockTable,
} from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

import {
  ACCOUNT_HISTORY_ROWS,
  CUSTOMERS_SNAPSHOT_ROWS,
  DIM_CUSTOMER_ROWS,
} from "./history-rows";

export const WAREHOUSE_ID = 8;
export const DIM_CUSTOMER_ID = 81;
export const CUSTOMERS_SNAPSHOT_ID = 82;
export const ACCOUNT_HISTORY_ID = 83;
export const FCT_ORDERS_ID = 84;
export const DIM_PRODUCT_ID = 85;

export const DIM_CUSTOMER_ID_FIELD_ID = 8102;
const DIM_CUSTOMER_PLAN_FIELD_ID = 8104;
const DIM_CUSTOMER_REGION_FIELD_ID = 8105;

type FieldSpec = Partial<Field> & Pick<Field, "id" | "name" | "display_name">;

const TEXT = {
  base_type: "type/Text",
  effective_type: "type/Text",
  database_type: "text",
} as const;
const INTEGER = {
  base_type: "type/Integer",
  effective_type: "type/Integer",
  database_type: "int8",
} as const;
const DATE = {
  base_type: "type/Date",
  effective_type: "type/Date",
  database_type: "date",
} as const;
const DATETIME = {
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
  database_type: "timestamp",
} as const;
const BOOLEAN = {
  base_type: "type/Boolean",
  effective_type: "type/Boolean",
  database_type: "bool",
} as const;
const DECIMAL = {
  base_type: "type/Decimal",
  effective_type: "type/Decimal",
  database_type: "numeric",
} as const;

function createFields(tableId: number, specs: FieldSpec[]): Field[] {
  return specs.map((spec, index) =>
    createMockField({
      table_id: tableId,
      position: index,
      semantic_type: null,
      ...TEXT,
      ...spec,
    }),
  );
}

const dimCustomerFields = createFields(DIM_CUSTOMER_ID, [
  {
    id: 8101,
    name: "customer_sk",
    display_name: "Customer SK",
    ...INTEGER,
    semantic_type: "type/PK",
  },
  {
    id: DIM_CUSTOMER_ID_FIELD_ID,
    name: "customer_id",
    display_name: "Customer ID",
  },
  { id: 8103, name: "name", display_name: "Name", semantic_type: "type/Name" },
  {
    id: DIM_CUSTOMER_PLAN_FIELD_ID,
    name: "plan",
    display_name: "Plan",
    semantic_type: "type/Category",
    has_field_values: "list",
  },
  {
    id: DIM_CUSTOMER_REGION_FIELD_ID,
    name: "region",
    display_name: "Region",
    semantic_type: "type/Category",
    has_field_values: "list",
  },
  {
    id: 8106,
    name: "segment",
    display_name: "Segment",
    semantic_type: "type/Category",
  },
  {
    id: 8107,
    name: "account_manager",
    display_name: "Account manager",
  },
  {
    id: 8108,
    name: "email",
    display_name: "Email",
    semantic_type: "type/Email",
  },
  {
    id: 8109,
    name: "created_at",
    display_name: "Created at",
    ...DATE,
    semantic_type: "type/CreationDate",
  },
  { id: 8110, name: "valid_from", display_name: "Valid from", ...DATE },
  { id: 8111, name: "valid_to", display_name: "Valid to", ...DATE },
  { id: 8112, name: "is_current", display_name: "Is current", ...BOOLEAN },
]);

const customersSnapshotFields = createFields(CUSTOMERS_SNAPSHOT_ID, [
  { id: 8201, name: "id", display_name: "ID", ...INTEGER },
  { id: 8202, name: "name", display_name: "Name", semantic_type: "type/Name" },
  {
    id: 8203,
    name: "plan",
    display_name: "Plan",
    semantic_type: "type/Category",
  },
  {
    id: 8204,
    name: "region",
    display_name: "Region",
    semantic_type: "type/Category",
  },
  {
    id: 8205,
    name: "email",
    display_name: "Email",
    semantic_type: "type/Email",
  },
  {
    id: 8206,
    name: "updated_at",
    display_name: "Updated at",
    ...DATETIME,
    semantic_type: "type/UpdatedTimestamp",
  },
  { id: 8207, name: "dbt_scd_id", display_name: "Dbt Scd ID" },
  {
    id: 8208,
    name: "dbt_updated_at",
    display_name: "Dbt Updated at",
    ...DATETIME,
  },
  {
    id: 8209,
    name: "dbt_valid_from",
    display_name: "Dbt Valid from",
    ...DATETIME,
  },
  { id: 8210, name: "dbt_valid_to", display_name: "Dbt Valid to", ...DATETIME },
]);

const accountHistoryFields = createFields(ACCOUNT_HISTORY_ID, [
  { id: 8301, name: "id", display_name: "ID", semantic_type: "type/PK" },
  { id: 8302, name: "name", display_name: "Name", semantic_type: "type/Name" },
  {
    id: 8303,
    name: "type",
    display_name: "Type",
    semantic_type: "type/Category",
  },
  {
    id: 8304,
    name: "industry",
    display_name: "Industry",
    semantic_type: "type/Category",
  },
  { id: 8305, name: "owner_id", display_name: "Owner ID" },
  {
    id: 8306,
    name: "annual_revenue",
    display_name: "Annual revenue",
    ...DECIMAL,
    semantic_type: "type/Currency",
  },
  {
    id: 8307,
    name: "_fivetran_start",
    display_name: "Fivetran Start",
    ...DATETIME,
    semantic_type: "type/PK",
  },
  {
    id: 8308,
    name: "_fivetran_end",
    display_name: "Fivetran End",
    ...DATETIME,
  },
  {
    id: 8309,
    name: "_fivetran_active",
    display_name: "Fivetran Active",
    ...BOOLEAN,
  },
  {
    id: 8310,
    name: "_fivetran_synced",
    display_name: "Fivetran Synced",
    ...DATETIME,
  },
]);

const fctOrdersFields = createFields(FCT_ORDERS_ID, [
  {
    id: 8401,
    name: "order_id",
    display_name: "Order ID",
    ...INTEGER,
    semantic_type: "type/PK",
  },
  {
    id: 8402,
    name: "customer_id",
    display_name: "Customer ID",
    semantic_type: "type/FK",
    fk_target_field_id: DIM_CUSTOMER_ID_FIELD_ID,
  },
  {
    id: 8403,
    name: "order_date",
    display_name: "Order date",
    ...DATE,
  },
  {
    id: 8404,
    name: "amount",
    display_name: "Amount",
    ...DECIMAL,
    semantic_type: "type/Currency",
  },
]);

const dimProductFields = createFields(DIM_PRODUCT_ID, [
  {
    id: 8501,
    name: "product_id",
    display_name: "Product ID",
    ...INTEGER,
    semantic_type: "type/PK",
  },
  { id: 8502, name: "name", display_name: "Name", semantic_type: "type/Name" },
  {
    id: 8503,
    name: "category",
    display_name: "Category",
    semantic_type: "type/Category",
  },
]);

type TableSpec = {
  id: number;
  name: string;
  displayName: string;
  fields: Field[];
  rows?: Record<string, RowValue>[];
  estimatedRowCount: number;
};

const TABLE_SPECS: TableSpec[] = [
  {
    id: DIM_CUSTOMER_ID,
    name: "dim_customer",
    displayName: "Dim Customer",
    fields: dimCustomerFields,
    rows: DIM_CUSTOMER_ROWS,
    estimatedRowCount: DIM_CUSTOMER_ROWS.length,
  },
  {
    id: CUSTOMERS_SNAPSHOT_ID,
    name: "customers_snapshot",
    displayName: "Customers Snapshot",
    fields: customersSnapshotFields,
    rows: CUSTOMERS_SNAPSHOT_ROWS,
    estimatedRowCount: CUSTOMERS_SNAPSHOT_ROWS.length,
  },
  {
    id: ACCOUNT_HISTORY_ID,
    name: "account_history",
    displayName: "Account History",
    fields: accountHistoryFields,
    rows: ACCOUNT_HISTORY_ROWS,
    estimatedRowCount: ACCOUNT_HISTORY_ROWS.length,
  },
  {
    id: FCT_ORDERS_ID,
    name: "fct_orders",
    displayName: "Fct Orders",
    fields: fctOrdersFields,
    estimatedRowCount: 61840,
  },
  {
    id: DIM_PRODUCT_ID,
    name: "dim_product",
    displayName: "Dim Product",
    fields: dimProductFields,
    estimatedRowCount: 412,
  },
];

export function createWarehouse(): Database {
  const tables: Table[] = TABLE_SPECS.map((spec) =>
    createMockTable({
      id: spec.id,
      db_id: WAREHOUSE_ID,
      schema: "analytics",
      name: spec.name,
      display_name: spec.displayName,
      fields: spec.fields,
      estimated_row_count: spec.estimatedRowCount,
    }),
  );
  return createMockDatabase({
    id: WAREHOUSE_ID,
    name: "Warehouse",
    engine: "postgres",
    tables,
  });
}

const values = (...items: string[]): FieldValue[] =>
  items.map((item) => [item]);

export const WAREHOUSE_FIELD_VALUES: GetFieldValuesResponse[] = [
  createMockFieldValues({
    field_id: DIM_CUSTOMER_PLAN_FIELD_ID,
    values: values("Starter", "Pro", "Enterprise"),
  }),
  createMockFieldValues({
    field_id: DIM_CUSTOMER_REGION_FIELD_ID,
    values: values("APAC", "EMEA", "NA"),
  }),
];

export function getHistoryDataset(query: unknown): Dataset | null {
  const sourceTableId = isObject(query) ? query["source-table"] : null;
  const spec = TABLE_SPECS.find((spec) => spec.id === sourceTableId);
  if (!spec?.rows) {
    return null;
  }
  const rows = spec.rows;
  return createMockDataset({
    data: createMockDatasetData({
      cols: spec.fields.map((field) =>
        createMockColumn({
          id: typeof field.id === "number" ? field.id : undefined,
          name: field.name,
          display_name: field.display_name,
          base_type: field.base_type,
          source: "fields",
        }),
      ),
      rows: rows.map((row) =>
        spec.fields.map((field) => row[field.name] ?? null),
      ),
    }),
    row_count: rows.length,
  });
}

export const EMPTY_TABLE_STRUCTURE = { tables: {}, grainByField: {} };
