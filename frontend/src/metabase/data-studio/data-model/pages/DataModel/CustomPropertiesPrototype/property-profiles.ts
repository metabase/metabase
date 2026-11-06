import type { Dataset, RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

import {
  CUSTOMERS_ID,
  CUSTOMER_PROPERTIES_ID,
  CUSTOM_FIELD_ID,
  CUSTOM_FIELD_ID_FIELD_ID,
  CUSTOM_FIELD_NAME_FIELD_ID,
  CUSTOM_FIELD_TITLE_FIELD_ID,
  CUSTOM_FIELD_TYPE_FIELD_ID,
  DEAL_PROPERTY_ID,
  DEAL_PROPERTY_LABEL_FIELD_ID,
  DEAL_PROPERTY_NAME_FIELD_ID,
  DEAL_PROPERTY_TYPE_FIELD_ID,
} from "./fixtures";

type PropertyProfile = {
  id: number;
  name: string;
  values: [string, number][];
};

type CustomFieldDefinition = {
  id: number;
  name: string;
  title: string;
  fieldType: string | null;
};

export const CUSTOMER_COUNT = 2480;

const DAY_MS = 24 * 60 * 60 * 1000;

const range = (
  count: number,
  toValue: (index: number) => string,
  total: number,
) =>
  Array.from({ length: count }, (_, index): [string, number] => [
    toValue(index),
    Math.max(
      1,
      Math.round((total * 2 * (count - index)) / (count * (count + 1))),
    ),
  ]);

const PROPERTY_PROFILES: PropertyProfile[] = [
  {
    id: 1,
    name: "plan",
    values: [
      ["Free", 1204],
      ["Starter", 610],
      ["Pro", 388],
      ["Enterprise", 72],
    ],
  },
  {
    id: 2,
    name: "region",
    values: [
      ["AMER", 1120],
      ["EMEA", 690],
      ["APAC", 348],
    ],
  },
  {
    id: 3,
    name: "hubspot_lifecycle_stage",
    values: [
      ["customer", 1210],
      ["lead", 402],
      ["mql", 240],
      ["sql", 166],
      ["evangelist", 82],
    ],
  },
  {
    id: 4,
    name: "signup_source",
    values: [
      ["website", 1022],
      ["referral", 431],
      ["partner", 228],
      ["event", 129],
    ],
  },
  {
    id: 5,
    name: "seats",
    values: [
      ...range(60, (index) => String((index + 1) * 5), 1597),
      ["10+", 38],
      ["unlimited", 9],
      ["", 3],
    ],
  },
  {
    id: 6,
    name: "mrr_usd",
    values: range(80, (index) => `${(index + 1) * 49}.00`, 1601),
  },
  {
    id: 7,
    name: "industry",
    values: [
      ["Software", 520],
      ["Financial services", 301],
      ["Retail", 244],
      ["Healthcare", 190],
      ["Education", 131],
      ["Media", 99],
    ],
  },
  {
    id: 8,
    name: "csm_email",
    values: range(
      18,
      (index) =>
        `${["ana", "bo", "chen", "dee", "eli", "fay", "gus", "hana", "ivo", "jun", "kai", "lea", "max", "nia", "oto", "pia", "raj", "sol"][index]}@acme.io`,
      951,
    ),
  },
  {
    id: 9,
    name: "nps_score",
    values: range(11, (index) => String(10 - index), 640),
  },
  {
    id: 10,
    name: "trial_ends_on",
    values: range(
      40,
      (index) =>
        new Date(Date.now() + (index * 9 - 120) * DAY_MS)
          .toISOString()
          .slice(0, 10),
      278,
    ),
  },
  {
    id: 11,
    name: "is_beta_tester",
    values: [
      ["true", 120],
      ["false", 66],
    ],
  },
  {
    id: 12,
    name: "plan_tier",
    values: [
      ["pro", 98],
      ["free", 41],
    ],
  },
  {
    id: 13,
    name: "churn_risk",
    values: [
      ["low", 52],
      ["medium", 31],
      ["high", 10],
    ],
  },
  {
    id: 14,
    name: "renewal_date",
    values: range(
      30,
      (index) =>
        new Date(Date.now() + (index * 12 + 20) * DAY_MS)
          .toISOString()
          .slice(0, 10),
      862,
    ),
  },
  {
    id: 15,
    name: "legacy_billing_id",
    values: range(50, (index) => `LB-${10023 + index * 7}`, 510),
  },
];

const CUSTOM_FIELD_DEFINITIONS: CustomFieldDefinition[] = [
  { id: 1, name: "plan", title: "Plan", fieldType: "dropdown" },
  { id: 2, name: "region", title: "Region", fieldType: "dropdown" },
  {
    id: 3,
    name: "hubspot_lifecycle_stage",
    title: "Lifecycle stage",
    fieldType: "dropdown",
  },
  {
    id: 4,
    name: "signup_source",
    title: "Signup source",
    fieldType: "dropdown",
  },
  { id: 5, name: "seats", title: "Seats", fieldType: "number" },
  { id: 6, name: "mrr_usd", title: "MRR", fieldType: "currency" },
  { id: 7, name: "industry", title: "Industry", fieldType: "dropdown" },
  { id: 8, name: "csm_email", title: "CSM", fieldType: "text" },
  { id: 9, name: "nps_score", title: "NPS", fieldType: null },
  { id: 10, name: "trial_ends_on", title: "Trial ends", fieldType: "date" },
  {
    id: 11,
    name: "is_beta_tester",
    title: "Beta tester",
    fieldType: "checkbox",
  },
  { id: 12, name: "plan_tier", title: "Plan Tier", fieldType: "dropdown" },
  { id: 13, name: "churn_risk", title: "Churn risk", fieldType: "dropdown" },
  { id: 14, name: "renewal_date", title: "Renewal date", fieldType: "date" },
  {
    id: 16,
    name: "partner_tier",
    title: "Partner tier",
    fieldType: "dropdown",
  },
];

const DEAL_PROPERTIES: [string, string, string][] = [
  ["dealname", "Deal name", "string"],
  ["amount", "Amount", "number"],
  ["createdate", "Create date", "datetime"],
  ["dealstage", "Deal stage", "enumeration"],
  ["lead_src_c", "Lead source", "enumeration"],
  ["partner_referral", "Partner referral", "bool"],
  ["implementation_start", "Implementation start", "date"],
  ["seats_requested", "Seats requested", "number"],
];

const sumCounts = (values: [string, number][]) =>
  values.reduce((sum, [, count]) => sum + count, 0);

const DISTINCT_VALUE_COUNTS: Record<string, number> = {
  legacy_billing_id: 510,
};

function dataset(columnNames: string[], rows: RowValue[][]): Dataset {
  return createMockDataset({
    data: createMockDatasetData({
      cols: columnNames.map((name) => createMockColumn({ name })),
      rows,
    }),
  });
}

export function getEntityCountDataset() {
  return dataset(["count"], [[CUSTOMER_COUNT]]);
}

const SAMPLE_CUSTOMERS: RowValue[][] = [
  [
    1042,
    "Northwind Traders",
    "ops@northwind.example",
    "Germany",
    "2021-04-12T09:30:00Z",
  ],
  [
    1043,
    "Blue Fjord",
    "hello@bluefjord.example",
    "USA",
    "2022-08-03T14:10:00Z",
  ],
  [
    1044,
    "Lumen Labs",
    "team@lumenlabs.example",
    "Japan",
    "2023-01-19T07:45:00Z",
  ],
  [
    1045,
    "Orbit Freight",
    "it@orbitfreight.example",
    "United Kingdom",
    "2020-11-02T11:00:00Z",
  ],
  [
    1046,
    "Acme Analytics",
    "data@acme.example",
    "Canada",
    "2024-05-27T16:20:00Z",
  ],
];

const SAMPLE_PROPERTY_ROWS: RowValue[][] = [
  [1042, 1, "Pro"],
  [1042, 2, "EMEA"],
  [1042, 5, "120"],
  [1042, 6, "2940.00"],
  [1042, 14, "2027-03-01"],
  [1042, 7, "Software"],
  [1042, 8, "ana@acme.io"],
  [1042, 3, "customer"],
  [1043, 1, "Starter"],
  [1043, 2, "AMER"],
  [1043, 5, "10+"],
  [1043, 14, "2026-12-15"],
  [1043, 7, "Retail"],
  [1043, 4, "referral"],
  [1044, 12, "pro"],
  [1044, 2, "APAC"],
  [1044, 5, "35"],
  [1044, 9, "9"],
  [1044, 10, "2026-11-20"],
  [1045, 1, "Enterprise"],
  [1045, 2, "EMEA"],
  [1045, 5, "260"],
  [1045, 6, "8820.00"],
  [1045, 14, "2027-06-30"],
  [1045, 11, "true"],
  [1045, 13, "low"],
  [1046, 1, "Free"],
  [1046, 2, "AMER"],
  [1046, 4, "website"],
  [1046, 15, "LB-10023"],
];

function getEntityFilterValue(query: Record<string, unknown>) {
  const filter = query.filter;
  return Array.isArray(filter) && filter[0] === "=" ? filter[2] : undefined;
}

function getSampleRowsDataset(query: Record<string, unknown>) {
  const entityKey = getEntityFilterValue(query);
  return dataset(
    ["customer_id", "custom_field_id", "value"],
    SAMPLE_PROPERTY_ROWS.filter(
      ([customerId]) => entityKey == null || customerId === entityKey,
    ),
  );
}

function getCustomersDataset(query: Record<string, unknown>) {
  if (Array.isArray(query.aggregation)) {
    return getEntityCountDataset();
  }
  const limit = typeof query.limit === "number" ? query.limit : undefined;
  return dataset(
    ["id", "name", "email", "country", "created_at"],
    SAMPLE_CUSTOMERS.slice(0, limit),
  );
}

export function getPropertySummaryDataset() {
  return dataset(
    ["custom_field_id", "entities", "count", "values"],
    PROPERTY_PROFILES.map((profile) => {
      const entityCount = sumCounts(profile.values);
      return [
        profile.id,
        entityCount,
        entityCount,
        DISTINCT_VALUE_COUNTS[profile.name] ?? profile.values.length,
      ];
    }),
  );
}

export function getPropertyValuesDataset() {
  return dataset(
    ["custom_field_id", "value", "entities"],
    PROPERTY_PROFILES.flatMap((profile) =>
      profile.values.map(([value, entities]) => [profile.id, value, entities]),
    ).sort((a, b) => Number(b[2]) - Number(a[2])),
  );
}

const CUSTOM_FIELD_COLUMNS: Record<number, keyof CustomFieldDefinition> = {
  [CUSTOM_FIELD_ID_FIELD_ID]: "id",
  [CUSTOM_FIELD_NAME_FIELD_ID]: "name",
  [CUSTOM_FIELD_TITLE_FIELD_ID]: "title",
  [CUSTOM_FIELD_TYPE_FIELD_ID]: "fieldType",
};

const DEAL_PROPERTY_COLUMNS: Record<number, number> = {
  [DEAL_PROPERTY_NAME_FIELD_ID]: 0,
  [DEAL_PROPERTY_LABEL_FIELD_ID]: 1,
  [DEAL_PROPERTY_TYPE_FIELD_ID]: 2,
};

function getRequestedFieldIds(query: Record<string, unknown>): number[] {
  return Array.isArray(query.fields)
    ? query.fields.flatMap((ref: unknown) =>
        Array.isArray(ref) && typeof ref[1] === "number" ? [ref[1]] : [],
      )
    : [];
}

function getCustomFieldDataset(fieldIds: number[]) {
  return dataset(
    fieldIds.map(String),
    CUSTOM_FIELD_DEFINITIONS.map((definition) =>
      fieldIds.map((fieldId) => {
        const column = CUSTOM_FIELD_COLUMNS[fieldId];
        return column ? definition[column] : null;
      }),
    ),
  );
}

function getDealPropertyDataset(fieldIds: number[]) {
  return dataset(
    fieldIds.map(String),
    DEAL_PROPERTIES.map((row) =>
      fieldIds.map((fieldId) => {
        const index = DEAL_PROPERTY_COLUMNS[fieldId];
        return index != null ? row[index] : null;
      }),
    ),
  );
}

export function getPropertyRegistryDataset(query: unknown): Dataset | null {
  if (!isObject(query)) {
    return null;
  }
  const sourceTable = query["source-table"];
  if (sourceTable === CUSTOM_FIELD_ID) {
    return getCustomFieldDataset(getRequestedFieldIds(query));
  }
  if (sourceTable === DEAL_PROPERTY_ID) {
    return getDealPropertyDataset(getRequestedFieldIds(query));
  }
  if (sourceTable === CUSTOMERS_ID) {
    return getCustomersDataset(query);
  }
  if (sourceTable !== CUSTOMER_PROPERTIES_ID) {
    return null;
  }
  if (Array.isArray(query.fields)) {
    return getSampleRowsDataset(query);
  }
  const breakoutCount = Array.isArray(query.breakout)
    ? query.breakout.length
    : 0;
  if (breakoutCount === 0) {
    return getEntityCountDataset();
  }
  return breakoutCount === 1
    ? getPropertySummaryDataset()
    : getPropertyValuesDataset();
}
