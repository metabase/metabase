import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import { createMockField } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createOrdersTable,
  createProductsTable,
  createPeopleTable,
  createReviewsTable,
  REVIEWS_ID,
  createPeoplePasswordField,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

export const LISTABLE_PK_FIELD_ID = 100;
export const LISTABLE_PK_FIELD_VALUE = "1234";
export const STRING_PK_FIELD_ID = 101;
export const SEARCHABLE_FK_FIELD_ID = 102;
export const LISTABLE_FIELD_WITH_MANY_VALUES_ID = 103;
export const EXPRESSION_FIELD_ID = [
  "field",
  "CC",
  { "base-type": "type/Text" },
];

const database = createSampleDatabase({
  tables: [
    createOrdersTable(),
    createProductsTable(),
    createPeopleTable(),
    createReviewsTable({
      fields: [
        createMockField({
          id: LISTABLE_PK_FIELD_ID,
          table_id: REVIEWS_ID,
          display_name: "ID",
          base_type: "type/BigInteger",
          effective_type: "type/BigInteger",
          semantic_type: "type/PK",
          has_field_values: "list",
          values: [[LISTABLE_PK_FIELD_VALUE]],
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
          id: LISTABLE_FIELD_WITH_MANY_VALUES_ID,
          table_id: REVIEWS_ID,
          display_name: "Big list",
          base_type: "type/Text",
          effective_type: "type/Text",
          has_field_values: "list",
          has_more_values: true,
        }),
        createMockField({
          id: EXPRESSION_FIELD_ID as any,
          field_ref: ["expression", "CC"],
        }),
      ],
    }),
  ],
});

export const state = createMockState({
  entities: createMockEntitiesState({
    databases: [database],
  }),
});

export const metadata = getMetadata(state);

const stateWithSearchValuesField = createMockState({
  entities: createMockEntitiesState({
    databases: [
      createSampleDatabase({
        tables: [
          createPeopleTable({
            fields: [
              createPeoplePasswordField({
                has_field_values: "search",
              }),
            ],
          }),
        ],
      }),
    ],
  }),
});

export const metadataWithSearchValuesField = getMetadata(
  stateWithSearchValuesField,
);
