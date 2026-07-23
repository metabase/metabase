import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";
import type { FieldFingerprint, FieldId } from "metabase-types/api";
import {
  createMockDateTimeFieldFingerprint,
  createMockFingerprint,
  createMockNumberFieldFingerprint,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QueryColumnFingerprintInfo } from "./ColumnFingerprintInfo";

const NUMBER_FINGERPRINT = createMockFingerprint({
  type: {
    "type/Number": createMockNumberFieldFingerprint({
      avg: 5000,
      min: 1,
      max: 10000,
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

const createFingerprintedState = (
  fieldId: FieldId,
  fingerprint: FieldFingerprint,
) => {
  const sampleDatabase = createSampleDatabase();

  return createMockState({
    entities: createMockEntitiesState({
      databases: [
        {
          ...sampleDatabase,
          tables: sampleDatabase.tables?.map((table) => ({
            ...table,
            fields: table.fields?.map((field) =>
              field.id === fieldId ? { ...field, fingerprint } : field,
            ),
          })),
        },
      ],
    }),
  });
};

const fingerprintedIdState = createFingerprintedState(
  PRODUCTS.ID,
  NUMBER_FINGERPRINT,
);

const setupLib = (
  columnName: string,
  state = fingerprintedIdState,
  timezone?: string,
) => {
  setupFieldsValuesEndpoints([]);

  const provider = Lib.metadataProvider(SAMPLE_DB_ID, getMetadata(state));
  const tableMetadata = Lib.tableOrCardMetadata(provider, PRODUCTS_ID);
  const query = Lib.queryFromTableOrCardMetadata(provider, tableMetadata!);
  const findColumn = columnFinder(query, Lib.returnedColumns(query, -1));

  return renderWithProviders(
    <div data-testid="container">
      <QueryColumnFingerprintInfo
        query={query}
        stageIndex={-1}
        column={findColumn("PRODUCTS", columnName)}
        timezone={timezone}
      />
    </div>,
    { storeInitialState: state },
  );
};

describe("QueryColumnFingerprintInfo", () => {
  it("should render the number fingerprint for a non-ID numeric column", async () => {
    setupLib("RATING");

    expect(await screen.findByText("Average")).toBeInTheDocument();
  });

  it("should not render the number fingerprint for a numeric ID column", () => {
    setupLib("ID");

    expect(screen.queryByText("Average")).not.toBeInTheDocument();
  });

  describe("temporal column", () => {
    const state = createFingerprintedState(
      PRODUCTS.CREATED_AT,
      DATE_TIME_FINGERPRINT,
    );
    const timezone = "America/Los_Angeles";

    it("should show the timezone of the column", () => {
      setupLib("CREATED_AT", state, timezone);

      expect(screen.getByText("America/Los_Angeles")).toBeVisible();
    });

    it("should render formatted earliest time", () => {
      setupLib("CREATED_AT", state, timezone);

      expect(screen.getByText("November 9, 2021, 4:43 AM")).toBeVisible();
    });

    it("should render formatted latest time", () => {
      setupLib("CREATED_AT", state, timezone);

      expect(screen.getByText("December 9, 2021, 4:43 AM")).toBeVisible();
    });

    it("should render nothing without a type/DateTime fingerprint", () => {
      const stateWithoutFingerprint = createFingerprintedState(
        PRODUCTS.CREATED_AT,
        createMockFingerprint({ type: {} }),
      );

      setupLib("CREATED_AT", stateWithoutFingerprint);

      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });
});
