import { createMockMetadata } from "__support__/metadata";
import {
  setupFieldEndpoints,
  setupFieldValuesEndpoint,
  setupFieldsValuesEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { getMetadata } from "metabase/metadata-store";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";
import type { FieldFingerprint, FieldReference } from "metabase-types/api";
import {
  createMockCard,
  createMockDateTimeFieldFingerprint,
  createMockField,
  createMockFingerprint,
  createMockGlobalFieldFingerprint,
  createMockNativeDatasetQuery,
  createMockNumberFieldFingerprint,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  PRODUCT_CATEGORY_VALUES,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QueryColumnFingerprintInfo } from "./QueryColumnFingerprintInfo";

const STAGE_INDEX = -1;

const NUMBER_FINGERPRINT = createMockFingerprint({
  type: {
    "type/Number": createMockNumberFieldFingerprint({
      avg: 3.33333,
      min: 1,
      max: 5,
    }),
  },
});

const DATE_TIME_FINGERPRINT = createMockFingerprint({
  type: {
    "type/DateTime": createMockDateTimeFieldFingerprint({
      earliest: "2021-11-09T04:43:33.667Z",
      latest: "2021-12-09T04:43:33.667Z",
    }),
  },
});

const EMPTY_FINGERPRINT = createMockFingerprint({ type: {} });

const TIMEZONE = "America/Los_Angeles";

interface SetupOpts {
  columnName: string;
  fingerprint?: FieldFingerprint | null;
  timezone?: string;
}

const setup = ({ columnName, fingerprint, timezone }: SetupOpts) => {
  setupFieldsValuesEndpoints([]);

  const sampleDatabase = createSampleDatabase();
  const database = {
    ...sampleDatabase,
    tables: sampleDatabase.tables?.map((table) =>
      table.id === PRODUCTS_ID
        ? {
            ...table,
            fields: table.fields?.map((field) =>
              field.name === columnName && fingerprint !== undefined
                ? { ...field, fingerprint }
                : field,
            ),
          }
        : table,
    ),
  };

  database.tables?.forEach((table) =>
    table.fields?.forEach((field) => setupFieldEndpoints(field)),
  );

  const state = createMockState({
    entities: createMockEntitiesState({ databases: [database] }),
  });

  const provider = Lib.metadataProvider(SAMPLE_DB_ID, getMetadata(state));
  const tableMetadata = Lib.tableOrCardMetadata(provider, PRODUCTS_ID);
  const query = Lib.queryFromTableOrCardMetadata(
    provider,
    checkNotNull(tableMetadata),
  );
  const findColumn = columnFinder(
    query,
    Lib.returnedColumns(query, STAGE_INDEX),
  );

  renderWithProviders(
    <div data-testid="container">
      <QueryColumnFingerprintInfo
        query={query}
        stageIndex={STAGE_INDEX}
        column={findColumn("PRODUCTS", columnName)}
        timezone={timezone}
      />
    </div>,
    { storeInitialState: state },
  );
};

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
  const database = createSampleDatabase();
  database.tables?.forEach((table) =>
    table.fields?.forEach((field) => setupFieldEndpoints(field)),
  );
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

  const metadata = createMockMetadata({
    databases: [database],
    questions: [card],
  });
  const provider = Lib.metadataProvider(SAMPLE_DB_ID, metadata);
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
  );
};

describe("QueryColumnFingerprintInfo", () => {
  describe("numeric column", () => {
    it("should render avg, min and max for a non-ID numeric column", () => {
      setup({ columnName: "RATING", fingerprint: NUMBER_FINGERPRINT });

      expect(screen.getByText("Average")).toBeInTheDocument();
      expect(screen.getByText("Min")).toBeInTheDocument();
      expect(screen.getByText("Max")).toBeInTheDocument();
      expect(screen.getByText("3.33")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("should render min and max when avg is missing", () => {
      setup({
        columnName: "RATING",
        fingerprint: createMockFingerprint({
          type: { "type/Number": { min: 1, max: 5 } },
        }),
      });

      expect(screen.queryByText("Average")).not.toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("should render nothing without a type/Number fingerprint", () => {
      setup({ columnName: "RATING", fingerprint: EMPTY_FINGERPRINT });

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });

    it("should render nothing for an empty type/Number fingerprint", () => {
      setup({
        columnName: "RATING",
        fingerprint: createMockFingerprint({ type: { "type/Number": {} } }),
      });

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });

    it("should render nothing without a fingerprint", () => {
      setup({ columnName: "RATING", fingerprint: null });

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });

  describe("temporal column", () => {
    it("should show the timezone of the column", () => {
      setup({
        columnName: "CREATED_AT",
        fingerprint: DATE_TIME_FINGERPRINT,
        timezone: TIMEZONE,
      });

      expect(screen.getByText(TIMEZONE)).toBeVisible();
    });

    it("should render formatted earliest time", () => {
      setup({
        columnName: "CREATED_AT",
        fingerprint: DATE_TIME_FINGERPRINT,
        timezone: TIMEZONE,
      });

      expect(screen.getByText("November 9, 2021, 4:43 AM")).toBeVisible();
    });

    it("should render formatted latest time", () => {
      setup({
        columnName: "CREATED_AT",
        fingerprint: DATE_TIME_FINGERPRINT,
        timezone: TIMEZONE,
      });

      expect(screen.getByText("December 9, 2021, 4:43 AM")).toBeVisible();
    });

    it("should render nothing without a type/DateTime fingerprint", () => {
      setup({ columnName: "CREATED_AT", fingerprint: EMPTY_FINGERPRINT });

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });

    it("should render nothing without a fingerprint", () => {
      setup({ columnName: "CREATED_AT", fingerprint: null });

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });

  describe("ID column", () => {
    it("should render the distinct count instead of the number fingerprint", async () => {
      setup({
        columnName: "ID",
        fingerprint: createMockFingerprint({
          ...NUMBER_FINGERPRINT,
          global: createMockGlobalFieldFingerprint({ "distinct-count": 123 }),
        }),
      });

      expect(
        await screen.findByText("123 distinct values"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Average")).not.toBeInTheDocument();
    });

    it("should render nothing without a fingerprint", () => {
      setup({ columnName: "ID", fingerprint: null });

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });

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
