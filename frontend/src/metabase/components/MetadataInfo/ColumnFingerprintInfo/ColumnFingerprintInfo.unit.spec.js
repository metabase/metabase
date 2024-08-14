import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import Dimension from "metabase-lib/v1/Dimension";
import {
  createSampleDatabase,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { TableColumnFingerprintInfo } from "./ColumnFingerprintInfo";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = getMetadata(state);

function setup(field) {
  return renderWithProviders(
    <div data-testid="container">
      <TableColumnFingerprintInfo
        field={field}
        timezone={field.table?.database?.timezone}
      />
    </div>,
    { storeInitialState: state },
  );
}

describe("FieldFingerprintInfo", () => {
  describe("without fingerprint", () => {
    const field = Dimension.parseMBQL(
      ["field", PRODUCTS.CREATED_AT, null],
      metadata,
    )
      .field()
      .clone();

    delete field.fingerprint;

    it("should render nothing", () => {
      setup(field);
      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });

  describe("Date field", () => {
    const dateField = Dimension.parseMBQL(
      ["field", PRODUCTS.CREATED_AT, null],
      metadata,
    )
      .field()
      .clone();

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
      field.table = {
        database: {
          timezone: "America/Los_Angeles",
        },
      };

      it("should show the timezone of the field", () => {
        setup(field);
        expect(screen.getByText("America/Los_Angeles")).toBeVisible();
      });

      it("should render formatted earliest time", () => {
        setup(field);
        expect(screen.getByText("November 9, 2021, 4:43 AM")).toBeVisible();
      });

      it("should render formatted latest time", () => {
        setup(field);
        expect(screen.getByText("December 9, 2021, 4:43 AM")).toBeVisible();
      });
    });
  });

  describe("Number field", () => {
    const numberField = Dimension.parseMBQL(
      ["field", PRODUCTS.RATING, null],
      metadata,
    ).field();

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
    const idField = Dimension.parseMBQL(
      ["field", PRODUCTS.ID, null],
      metadata,
    ).field();

    const field = idField.clone();
    field.fingerprint = {
      type: {
        global: {
          "distinct-count": 123,
        },
        "type/ID": {},
      },
    };

    it("should render nothing", () => {
      setup(field);
      expect(screen.getByTestId("container")).toBeEmptyDOMElement();
    });
  });
});
