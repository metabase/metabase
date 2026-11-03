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
export const CUSTOMER_PROPERTY_COLUMNS_ID = 74;

export const CUSTOMERS_ID_FIELD_ID = 7101;
export const CUSTOMERS_PROPERTIES_LINK_FIELD_ID = 7106;
export const PROPERTY_CUSTOMER_ID_FIELD_ID = 7201;
export const PROPERTY_NAME_FIELD_ID = 7202;
export const PROPERTY_VALUE_FIELD_ID = 7203;
export const PROPERTY_UPDATED_AT_FIELD_ID = 7204;
export const PIVOT_CUSTOMER_ID_FIELD_ID = 7401;
export const PIVOT_PLAN_FIELD_ID = 7402;
export const PIVOT_SEATS_FIELD_ID = 7403;
export const PIVOT_REGION_FIELD_ID = 7405;
export const PIVOT_INDUSTRY_FIELD_ID = 7406;

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

const customersFields = (withPropertiesLink: boolean) =>
  createFields(CUSTOMERS_ID, [
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
    ...(withPropertiesLink
      ? [
          {
            id: CUSTOMERS_PROPERTIES_LINK_FIELD_ID,
            name: "custom_properties",
            display_name: "Custom properties",
            base_type: "type/Integer" as const,
            effective_type: "type/Integer" as const,
            database_type: "int4",
            semantic_type: "type/FK" as const,
            visibility_type: "hidden" as const,
            fk_target_field_id: PIVOT_CUSTOMER_ID_FIELD_ID,
          },
        ]
      : []),
  ]);

const customerPropertiesFields = createFields(CUSTOMER_PROPERTIES_ID, [
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
    id: PROPERTY_NAME_FIELD_ID,
    name: "property_name",
    display_name: "Property name",
    semantic_type: "type/Category",
    has_field_values: "list",
  },
  {
    id: PROPERTY_VALUE_FIELD_ID,
    name: "property_value",
    display_name: "Property value",
    has_field_values: "search",
  },
  {
    id: PROPERTY_UPDATED_AT_FIELD_ID,
    name: "updated_at",
    display_name: "Updated at",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    database_type: "timestamp",
    semantic_type: "type/UpdatedTimestamp",
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

const customerPropertyColumnsFields = createFields(
  CUSTOMER_PROPERTY_COLUMNS_ID,
  [
    {
      id: PIVOT_CUSTOMER_ID_FIELD_ID,
      name: "customer_id",
      display_name: "Customer ID",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      database_type: "int4",
      semantic_type: "type/PK",
      visibility_type: "details-only",
    },
    {
      id: PIVOT_PLAN_FIELD_ID,
      name: "plan",
      display_name: "Plan",
      semantic_type: "type/Category",
      has_field_values: "list",
    },
    {
      id: PIVOT_SEATS_FIELD_ID,
      name: "seats",
      display_name: "Seats",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      database_type: "int4",
      semantic_type: "type/Quantity",
    },
    {
      id: 7404,
      name: "mrr_usd",
      display_name: "MRR",
      base_type: "type/Decimal",
      effective_type: "type/Decimal",
      database_type: "numeric",
      semantic_type: "type/Currency",
    },
    {
      id: PIVOT_REGION_FIELD_ID,
      name: "region",
      display_name: "Region",
      semantic_type: "type/Category",
      has_field_values: "list",
    },
    {
      id: PIVOT_INDUSTRY_FIELD_ID,
      name: "industry",
      display_name: "Industry",
      semantic_type: "type/Category",
      has_field_values: "list",
    },
    {
      id: 7407,
      name: "csm_email",
      display_name: "CSM",
      semantic_type: "type/Email",
    },
    {
      id: 7408,
      name: "trial_ends_on",
      display_name: "Trial ends",
      base_type: "type/Date",
      effective_type: "type/Date",
      database_type: "date",
    },
    {
      id: 7409,
      name: "is_beta_tester",
      display_name: "Beta tester",
      base_type: "type/Boolean",
      effective_type: "type/Boolean",
      database_type: "bool",
    },
    {
      id: 7410,
      name: "churn_risk",
      display_name: "Churn risk",
      semantic_type: "type/Category",
    },
  ],
);

type CreateWarehouseOpts = {
  withPropertyColumns: boolean;
};

export function createWarehouse({
  withPropertyColumns,
}: CreateWarehouseOpts): Database {
  const tables: Table[] = [
    createMockTable({
      id: CUSTOMERS_ID,
      db_id: WAREHOUSE_ID,
      schema: "public",
      name: "customers",
      display_name: "Customers",
      entity_type: "entity/UserTable",
      fields: customersFields(withPropertyColumns),
      estimated_row_count: 2320,
    }),
    createMockTable({
      id: CUSTOMER_PROPERTIES_ID,
      db_id: WAREHOUSE_ID,
      schema: "public",
      name: "customer_properties",
      display_name: "Customer properties",
      entity_type: "entity/GenericTable",
      fields: customerPropertiesFields,
      estimated_row_count: 48210,
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
    ...(withPropertyColumns
      ? [
          createMockTable({
            id: CUSTOMER_PROPERTY_COLUMNS_ID,
            db_id: WAREHOUSE_ID,
            schema: "public",
            name: "customer_property_columns",
            display_name: "Custom properties",
            fields: customerPropertyColumnsFields,
          }),
        ]
      : []),
  ];
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
    field_id: 7104,
    values: values("Canada", "Germany", "Japan", "United Kingdom", "USA"),
  }),
  createMockFieldValues({
    field_id: PROPERTY_NAME_FIELD_ID,
    values: values(
      "churn_risk",
      "csm_email",
      "hubspot_lifecycle_stage",
      "industry",
      "is_beta_tester",
      "legacy_billing_id",
      "mrr_usd",
      "nps_score",
      "plan",
      "Plan Tier",
      "region",
      "seats",
      "signup_source",
      "trial_ends_on",
    ),
  }),
  createMockFieldValues({
    field_id: PIVOT_PLAN_FIELD_ID,
    values: values("Free", "Starter", "Pro", "Enterprise"),
  }),
  createMockFieldValues({
    field_id: PIVOT_REGION_FIELD_ID,
    values: values("AMER", "APAC", "EMEA"),
  }),
  createMockFieldValues({
    field_id: PIVOT_INDUSTRY_FIELD_ID,
    values: values(
      "Education",
      "Financial services",
      "Healthcare",
      "Media",
      "Retail",
      "Software",
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
      displayName: "MRR",
      description: "Monthly recurring revenue in US dollars",
      synonyms: ["revenue"],
    },
    csm_email: {
      displayName: "CSM",
      description: "Customer success manager who owns the account",
    },
    nps_score: { displayName: "NPS" },
    hubspot_lifecycle_stage: { displayName: "Lifecycle stage" },
  },
};

export const EMPTY_TABLE_STRUCTURE = { tables: {}, grainByField: {} };

export const PIVOTED_CUSTOMERS_SQL = `SELECT
  "custom_properties"."region" AS "custom_properties__region",
  COUNT(*) AS "count"
FROM
  "public"."customers"
  LEFT JOIN (
    SELECT
      "customer_id",
      MAX(CASE WHEN "property_name" = 'plan' THEN "property_value" END) AS "plan",
      MAX(CASE WHEN "property_name" = 'region' THEN "property_value" END) AS "region",
      MAX(
        CASE
          WHEN "property_name" = 'seats'
          AND "property_value" ~ '^[0-9]+$' THEN CAST("property_value" AS INTEGER)
        END
      ) AS "seats"
    FROM
      "public"."customer_properties"
    WHERE
      "property_name" IN ('plan', 'region', 'seats')
    GROUP BY
      "customer_id"
  ) AS "custom_properties" ON "public"."customers"."id" = "custom_properties"."customer_id"
WHERE
  "custom_properties"."plan" IN ('Pro', 'Enterprise')
  AND "custom_properties"."seats" > 50
GROUP BY
  "custom_properties"."region"
ORDER BY
  "custom_properties"."region" ASC`;
