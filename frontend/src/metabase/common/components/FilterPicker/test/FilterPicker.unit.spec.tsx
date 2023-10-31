import userEvent from "@testing-library/user-event";
import { getIcons, getIcon, screen } from "__support__/ui";
import * as Lib_ColumnTypes from "metabase-lib/column_types";
import {
  setup,
  createQueryWithFilter,
  createQueryWithSegmentFilter,
  SEGMENT_1,
  SEGMENT_2,
} from "./setup";

describe("FilterPicker", () => {
  describe("without a filter", () => {
    it("should list filterable columns", () => {
      setup();

      expect(screen.getByText("Order")).toBeInTheDocument();
      expect(screen.getByText("Discount")).toBeInTheDocument();

      userEvent.click(screen.getByText("Product"));
      expect(screen.getByText("Category")).toBeInTheDocument();
    });

    it("should not highlight anything", () => {
      setup();

      expect(screen.getByLabelText("Total")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText("Discount")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText(SEGMENT_1.name)).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should filter visible columns based on search input", () => {
      setup();
      expect(screen.getByText("Discount")).toBeInTheDocument();
      userEvent.type(screen.getByPlaceholderText("Find..."), "total");
      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.queryByText("Discount")).not.toBeInTheDocument();
    });

    it("should show sections for implicitly joined tables and custom expressions", () => {
      setup();
      userEvent.click(getIcon("chevronup"));
      expect(getIcons("connections")).toHaveLength(2);
      screen.getAllByRole("heading").forEach(heading => {
        expect(heading).toHaveTextContent(
          /order|user|product|custom expression/i,
        );
      });
    });
  });

  describe("with a filter", () => {
    it("should show the filter editor", () => {
      setup(createQueryWithFilter());
      expect(screen.getByText("Update filter")).toBeInTheDocument();
    });

    it("should highlight the selected column", async () => {
      setup(createQueryWithFilter());

      userEvent.click(screen.getByLabelText("Back"));

      expect(await screen.findByLabelText("Total")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByLabelText("Discount")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText(SEGMENT_1.name)).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should highlight the selected segment", async () => {
      setup(createQueryWithSegmentFilter());

      expect(await screen.findByLabelText(SEGMENT_1.name)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByLabelText(SEGMENT_2.name)).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(screen.getByLabelText("Total")).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should open the expression editor when column type isn't supported", () => {
      jest.spyOn(Lib_ColumnTypes, "isNumeric").mockReturnValue(false);
      setup(createQueryWithFilter());
      expect(screen.getByText(/Custom expression/i)).toBeInTheDocument();
    });
  });

  describe("basic filter widgets", () => {
    it("should show a string filter widget for a string filter", () => {
      setup(
        createQueryWithFilter({
          tableName: "PRODUCTS",
          columnName: "TITLE",
          operator: "contains",
          values: ["foo"],
        }),
      );

      expect(screen.getByTestId("string-filter-picker")).toBeInTheDocument();
    });

    it("should show a number filter widget for a number filter", () => {
      setup(
        createQueryWithFilter({
          tableName: "PRODUCTS",
          columnName: "PRICE",
          operator: ">",
          values: [50.0],
        }),
      );

      expect(screen.getByTestId("number-filter-picker")).toBeInTheDocument();
    });
  });
});
