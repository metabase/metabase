import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { asNotNull } from "metabase/utils/types";
import type { Field, FieldId, ParameterFieldInfo } from "metabase-types/api";
import {
  createMockField,
  createMockFieldDimension,
  createMockParameterFieldInfo,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  PRODUCTS,
  REVIEWS_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

export const LISTABLE_PK_FIELD_ID = 100;
export const STRING_PK_FIELD_ID = 101;
export const SEARCHABLE_FK_FIELD_ID = 102;
export const REMAPPED_TO_STRING_FIELD_ID = 104;
export const REMAPPED_TO_NUMBER_FIELD_ID = 105;
export const PK_REMAPPED_TO_NUMBER_FIELD_ID = 106;
export const EXPRESSION_FIELD_ID = [
  "field",
  "CC",
  { "base-type": "type/Text" },
];

const ordersTable = createOrdersTable();
const productsTable = createProductsTable();
const peopleTable = createPeopleTable();

const productsTitleField = asNotNull(
  productsTable.fields?.find((field) => field.id === PRODUCTS.TITLE),
);
const ordersTotalField = asNotNull(
  ordersTable.fields?.find((field) => field.id === ORDERS.TOTAL),
);

const reviewsFields = [
  createMockField({
    id: LISTABLE_PK_FIELD_ID,
    table_id: REVIEWS_ID,
    display_name: "ID",
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/PK",
    has_field_values: "list",
  }),
  createMockField({
    id: STRING_PK_FIELD_ID,
    table_id: REVIEWS_ID,
    display_name: "String ID",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/PK",
  }),
  createMockField({
    id: SEARCHABLE_FK_FIELD_ID,
    table_id: REVIEWS_ID,
    display_name: "Product ID",
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/FK",
    has_field_values: "search",
  }),
  createMockField({
    id: REMAPPED_TO_STRING_FIELD_ID,
    table_id: REVIEWS_ID,
    display_name: "Remapped to a string",
    base_type: "type/Text",
    effective_type: "type/Text",
    dimensions: [
      createMockFieldDimension({
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
        human_readable_field: productsTitleField,
      }),
    ],
  }),
  createMockField({
    id: REMAPPED_TO_NUMBER_FIELD_ID,
    table_id: REVIEWS_ID,
    display_name: "Remapped to a number",
    base_type: "type/Text",
    effective_type: "type/Text",
    dimensions: [
      createMockFieldDimension({
        type: "external",
        human_readable_field_id: ORDERS.TOTAL,
        human_readable_field: ordersTotalField,
      }),
    ],
  }),
  createMockField({
    id: PK_REMAPPED_TO_NUMBER_FIELD_ID,
    table_id: REVIEWS_ID,
    display_name: "Number ID remapped to a number",
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    semantic_type: "type/PK",
    dimensions: [
      createMockFieldDimension({
        type: "external",
        human_readable_field_id: ORDERS.TOTAL,
        human_readable_field: ordersTotalField,
      }),
    ],
  }),
  createMockField({
    // Unjustified type cast. FIXME
    id: EXPRESSION_FIELD_ID as any,
    field_ref: ["expression", "CC"],
  }),
];

const database = createSampleDatabase({
  tables: [
    ordersTable,
    productsTable,
    peopleTable,
    createReviewsTable({ fields: reviewsFields }),
  ],
});

const allFields: Field[] = [
  ...(ordersTable.fields ?? []),
  ...(productsTable.fields ?? []),
  ...(peopleTable.fields ?? []),
  ...reviewsFields,
];

export const getField = (id: FieldId): ParameterFieldInfo => {
  const field = asNotNull(allFields.find((field) => field.id === id));
  return createMockParameterFieldInfo({
    ...field,
    has_remapping: field.dimensions != null || field.name_field != null,
  });
};

export const state = createMockState({
  entities: createMockEntitiesState({
    databases: [database],
  }),
});
