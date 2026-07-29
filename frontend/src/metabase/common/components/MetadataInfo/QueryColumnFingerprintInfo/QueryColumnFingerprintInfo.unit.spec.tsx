import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";
import type { FieldFingerprint } from "metabase-types/api";
import {
  createMockDateTimeFieldFingerprint,
  createMockFingerprint,
  createMockGlobalFieldFingerprint,
  createMockNumberFieldFingerprint,
} from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
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
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [
        {
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
        },
      ],
    }),
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
    it("should render the distinct count instead of the number fingerprint", () => {
      setup({
        columnName: "ID",
        fingerprint: createMockFingerprint({
          ...NUMBER_FINGERPRINT,
          global: createMockGlobalFieldFingerprint({ "distinct-count": 123 }),
        }),
      });

      expect(screen.getByText("123 distinct values")).toBeInTheDocument();
      expect(screen.queryByText("Average")).not.toBeInTheDocument();
    });

    it("should render nothing without a fingerprint", () => {
      setup({ columnName: "ID", fingerprint: null });

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });
});
