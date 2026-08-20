import { setupFieldValuesEndpoint } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldReference } from "metabase-types/api";
import {
  createMockCard,
  createMockField,
  createMockFingerprint,
  createMockGlobalFieldFingerprint,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  PRODUCT_CATEGORY_VALUES,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  QueryColumnFingerprintInfo,
  TableColumnFingerprintInfo,
} from "./ColumnFingerprintInfo";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = getMetadata(state);

function setup(field: Field, timezone?: string) {
  return renderWithProviders(
    <div data-testid="container">
      <TableColumnFingerprintInfo field={field} timezone={timezone} />
    </div>,
    { storeInitialState: state },
  );
}

describe("FieldFingerprintInfo", () => {
  const dateField = metadata.field(PRODUCTS.CREATED_AT)!;

  describe("without fingerprint", () => {
    const field = dateField.clone();

    delete field.fingerprint;

    it("should render nothing", () => {
      setup(field);
      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });

  describe("Date field", () => {
    describe("without type/DateTime fingerprint", () => {
      const field = dateField.clone();
      field.fingerprint = { type: {} };

      it("should render nothing", () => {
        setup(field);
        expect(screen.getByTestId("container")).toBeEmptyDOMElement();
      });
    });

    describe("with type/DateTime fingerprint", () => {
      const field = dateField.clone();
      field.fingerprint = {
        type: {
          "type/DateTime": {
            earliest: "2021-11-09T04:43:33.667Z",
            latest: "2021-12-09T04:43:33.667Z",
          },
        },
      };
      const timezone = "America/Los_Angeles";

      it("should show the timezone of the field", () => {
        setup(field, timezone);
        expect(screen.getByText("America/Los_Angeles")).toBeVisible();
      });

      it("should render formatted earliest time", () => {
        setup(field, timezone);
        expect(screen.getByText("November 9, 2021, 4:43 AM")).toBeVisible();
      });

      it("should render formatted latest time", () => {
        setup(field, timezone);
        expect(screen.getByText("December 9, 2021, 4:43 AM")).toBeVisible();
      });
    });
  });

  describe("Number field", () => {
    const numberField = metadata.field(PRODUCTS.RATING)!.clone();

    numberField.semantic_type = null;

    describe("without type/Number fingerprint", () => {
      const field = numberField.clone();
      field.fingerprint = { type: {} };

      it("should render nothing", () => {
        setup(field);
        expect(screen.getByTestId("container")).toBeEmptyDOMElement();
      });
    });

    describe("with type/Number fingerprint", () => {
      const field = numberField.clone();
      field.fingerprint = {
        type: {
          "type/Number": {
            avg: 3.33333,
            min: 1,
            max: 5,
          },
        },
      };

      it("should render avg", () => {
        setup(field);
        expect(screen.getByText("3.33")).toBeVisible();
      });

      it("should render min", () => {
        setup(field);
        expect(screen.getByText("1")).toBeVisible();
      });

      it("should render max", () => {
        setup(field);
        expect(screen.getByText("5")).toBeVisible();
      });
    });

    describe("with empty type/Number fingerprint", () => {
      const field = numberField.clone();
      field.fingerprint = {
        type: {
          "type/Number": {},
        },
      };

      it("should render nothing", () => {
        setup(field);
        expect(screen.getByTestId("container")).toBeEmptyDOMElement();
      });
    });

    describe("with missing type/Number property", () => {
      const field = numberField.clone();
      field.fingerprint = {
        type: {
          "type/Number": {
            min: 1,
            max: 5,
          },
        },
      };

      it("should not render anything for the avg", () => {
        setup(field);
        expect(screen.queryByText("Average")).not.toBeInTheDocument();
      });

      it("should still render min and max", () => {
        setup(field);
        expect(screen.getByText("1")).toBeVisible();
        expect(screen.getByText("5")).toBeVisible();
      });
    });
  });

  describe("Other field types", () => {
    const idField = metadata.field(PRODUCTS.ID)!;
    const field = idField.clone();
    field.fingerprint = {
      global: {
        "distinct-count": 123,
      },
      type: {},
    };

    it("should render nothing", () => {
      setup(field);
      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });
});

const STAGE_INDEX = -1;

const MODEL_ID = 1;

const UNMAPPED_FIELD_REF: FieldReference = [
  "field",
  "CATEGORY",
  { "base-type": "type/Text" },
];

interface SetupNativeModelOpts {
  mappedToField: boolean;
}

const setupNativeModel = ({ mappedToField }: SetupNativeModelOpts) => {
  setupFieldValuesEndpoint(PRODUCT_CATEGORY_VALUES);

  const card = createMockCard({
    id: MODEL_ID,
    type: "model",
    dataset_query: createMockNativeDatasetQuery({
      database: SAMPLE_DB_ID,
      native: { query: "select * from products limit 5" },
    }),
    result_metadata: [
      createMockField({
        name: "CATEGORY",
        display_name: "Category",
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Category",
        // the model returns 5 rows, so its own metadata only sees 3 categories
        fingerprint: createMockFingerprint({
          global: createMockGlobalFieldFingerprint({ "distinct-count": 3 }),
        }),
        ...(mappedToField
          ? { id: PRODUCTS.CATEGORY, table_id: PRODUCTS_ID }
          : { id: UNMAPPED_FIELD_REF }),
        field_ref: mappedToField
          ? ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]
          : UNMAPPED_FIELD_REF,
      }),
    ],
  });

  const modelState = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });

  const provider = Lib.metadataProvider(SAMPLE_DB_ID, getMetadata(modelState));
  const cardMetadata = checkNotNull(
    Lib.tableOrCardMetadata(provider, `card__${MODEL_ID}`),
  );
  const query = Lib.queryFromTableOrCardMetadata(provider, cardMetadata);
  const findColumn = columnFinder(
    query,
    Lib.returnedColumns(query, STAGE_INDEX),
  );

  renderWithProviders(
    <div data-testid="container">
      <QueryColumnFingerprintInfo
        query={query}
        stageIndex={STAGE_INDEX}
        column={findColumn(null, "CATEGORY")}
      />
    </div>,
    { storeInitialState: modelState },
  );
};

describe("QueryColumnFingerprintInfo", () => {
  describe("native model column", () => {
    it("should use the mapped field's distinct count rather than the model's own (metabase#23103)", async () => {
      setupNativeModel({ mappedToField: true });

      expect(await screen.findByText("4 distinct values")).toBeInTheDocument();
      expect(screen.queryByText("3 distinct values")).not.toBeInTheDocument();
    });

    it("should render nothing when the column is not mapped to a field", async () => {
      setupNativeModel({ mappedToField: false });

      await waitFor(() =>
        expect(screen.getByTestId("container")).toBeEmptyDOMElement(),
      );
    });
  });
});
