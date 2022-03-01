import React from "react";
import { renderWithProviders, screen } from "__support__/ui";

import { PRODUCTS, metadata } from "__support__/sample_database_fixture";
import Dimension from "metabase-lib/lib/Dimension";

import FieldFingerprintInfo from "./FieldFingerprintInfo";

function setup(field) {
  return renderWithProviders(<FieldFingerprintInfo field={field} />);
}

describe("FieldFingerprintInfo", () => {
  describe("without fingerprint", () => {
    it("should render nothing", () => {
      const field = Dimension.parseMBQL(
        ["field", PRODUCTS.CREATED_AT.id, null],
        metadata,
      ).field();

      delete field.fingerprint;
      const { container } = setup(field);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Date field", () => {
    const dateField = Dimension.parseMBQL(
      ["field", PRODUCTS.CREATED_AT.id, null],
      metadata,
    ).field();
    let container;

    describe("without type/DateTime fingerprint", () => {
      beforeEach(() => {
        dateField.fingerprint = { type: {} };
        const wrapper = setup(dateField);
        container = wrapper.container;
      });

      it("should render nothing", () => {
        expect(container.firstChild).toBeNull();
      });
    });

    describe("with type/DateTime fingerprint", () => {
      beforeEach(() => {
        dateField.fingerprint = {
          type: {
            "type/DateTime": {
              earliest: "2021-11-09T04:43:33.667Z",
              latest: "2021-12-09T04:43:33.667Z",
            },
          },
        };
        dateField.table = {
          database: {
            timezone: "America/Los_Angeles",
          },
        };
        setup(dateField);
      });

      it("should show the timezone of the field", () => {
        expect(screen.getByText("America/Los_Angeles")).toBeVisible();
      });

      it("should render formatted earliest time", () => {
        expect(screen.getByText("November 9, 2021, 4:43 AM")).toBeVisible();
      });

      it("should render formatted latest time", () => {
        expect(screen.getByText("December 9, 2021, 4:43 AM")).toBeVisible();
      });
    });
  });

  describe("Number field", () => {
    const numberField = Dimension.parseMBQL(
      ["field", PRODUCTS.RATING.id, null],
      metadata,
    ).field();
    numberField.semantic_type = null;
    let container;

    describe("without type/Number fingerprint", () => {
      beforeEach(() => {
        numberField.fingerprint = { type: {} };
        const wrapper = setup(numberField);
        container = wrapper.container;
      });

      it("should render nothing", () => {
        expect(container.firstChild).toBeNull();
      });
    });

    describe("with type/Number fingerprint", () => {
      beforeEach(() => {
        numberField.fingerprint = {
          type: {
            "type/Number": {
              avg: 3.33333,
              min: 1,
              max: 5,
            },
          },
        };

        setup(numberField);
      });

      it("should render avg", () => {
        expect(screen.getByText("3.33")).toBeVisible();
      });

      it("should render min", () => {
        expect(screen.getByText("1")).toBeVisible();
      });

      it("should render max", () => {
        expect(screen.getByText("5")).toBeVisible();
      });
    });

    describe("with empty type/Number fingerprint", () => {
      beforeEach(() => {
        numberField.fingerprint = {
          type: {
            "type/Number": {},
          },
        };

        setup(numberField);
      });

      it("should render nothing", () => {
        expect(container.firstChild).toBeNull();
      });
    });

    describe("with missing type/Number property", () => {
      beforeEach(() => {
        numberField.fingerprint = {
          type: {
            "type/Number": {
              min: 1,
              max: 5,
            },
          },
        };

        setup(numberField);
      });

      it("should not render anything for the avg", () => {
        expect(screen.queryByText("Average")).toBeNull();
      });

      it("should still render min and max", () => {
        expect(screen.getByText("1")).toBeVisible();
        expect(screen.getByText("5")).toBeVisible();
      });
    });
  });

  describe("Other field types", () => {
    it("should render nothing", () => {
      const idField = Dimension.parseMBQL(
        ["field", PRODUCTS.ID.id, null],
        metadata,
      ).field();
      idField.fingerprint = {
        type: {
          global: {
            "distinct-count": 123,
          },
          "type/ID": {},
        },
      };

      const { container } = setup(idField);
      expect(container.firstChild).toBeNull();
    });
  });
});
