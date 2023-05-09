// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from "react";
import { render, screen } from "@testing-library/react";

import { createMockMetadata } from "__support__/metadata";

import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import Question from "metabase-lib/Question";
import Field from "metabase-lib/metadata/Field";
import Filter from "metabase-lib/queries/structured/Filter";

import BooleanPicker, { BooleanPickerCheckbox } from "./index";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const booleanField = new Field({
  database_type: "bool",
  semantic_type: "type/Category",
  table_id: 8,
  name: "bool",
  has_field_values: "list",
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Boolean",
  id: 134,
  base_type: "type/Boolean",
  metadata,
});

const card = {
  dataset_query: {
    database: 5,
    query: {
      "source-table": 8,
      filter: ["=", ["field", 134, null], true],
    },
    type: "query",
  },
  display: "table",
  visualization_settings: {},
};

metadata.fields[booleanField.id] = booleanField;

const question = new Question(card, metadata);

const fieldRef = ["field", 134, null];
const filters = {
  True: new Filter(["=", fieldRef, true], null, question.query()),
  False: new Filter(["=", fieldRef, false], null, question.query()),
  Empty: new Filter(["is-null", fieldRef], null, question.query()),
  "Not empty": new Filter(["not-null", fieldRef], null, question.query()),
};

const invalidFilter = new Filter(["=", fieldRef], question.query());

const mockOnFilterChange = jest.fn();
function setup(filter) {
  mockOnFilterChange.mockReset();
  return render(
    <BooleanPicker filter={filter} onFilterChange={mockOnFilterChange} />,
  );
}

describe("BooleanPicker", () => {
  describe("BooleanPickerRadio", () => {
    it("should hide empty options when empty options are not selected", () => {
      setup(filters.True);

      expect(screen.queryByLabelText("Empty")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Not empty")).not.toBeInTheDocument();

      screen.getByText("More options").click();

      expect(screen.getByLabelText("Empty")).toBeInTheDocument();
      expect(screen.getByLabelText("Not empty")).toBeInTheDocument();
    });

    it("should show empty options when given an empty filter", () => {
      setup(filters.Empty);

      const option = screen.getByLabelText("Empty");
      expect(option.checked).toBe(true);

      expect(screen.getByLabelText("Not empty")).toBeInTheDocument();
    });

    Object.entries(filters).forEach(([label, filter]) => {
      it(`should have the "${label}" option selected when given the associated filter`, () => {
        setup(filter);

        const option = screen.getByLabelText(label);
        expect(option.checked).toBe(true);
      });

      it(`should correctly update the filter for the "${label}" option when it is selected`, () => {
        setup(label === "True" ? filters.False : filters.True);

        screen.getByText("More options").click();

        screen.getByLabelText(label).click();
        expect(mockOnFilterChange).toHaveBeenCalled();
        const newFilter = mockOnFilterChange.mock.calls[0][0];

        expect(newFilter.raw()).toEqual(filter.raw());
      });
    });
  });

  describe("BooleanPickerCheckbox", () => {
    it("should render a true checkbox", () => {
      render(
        <BooleanPickerCheckbox
          filter={filters.True}
          onFilterChange={mockOnFilterChange}
        />,
      );
      expect(screen.getByLabelText("True")).toBeChecked();
      expect(screen.getByLabelText("False")).not.toBeChecked();
    });
    it("should render a false checkbox", () => {
      render(
        <BooleanPickerCheckbox
          filter={filters.False}
          onFilterChange={mockOnFilterChange}
        />,
      );
      expect(screen.getByLabelText("True")).not.toBeChecked();
      expect(screen.getByLabelText("False")).toBeChecked();
    });

    it("should render indeterminate checkboxes", () => {
      render(
        <BooleanPickerCheckbox
          filter={filters.Empty}
          onFilterChange={mockOnFilterChange}
        />,
      );

      screen.getAllByRole("img").forEach(el => {
        expect(el.classList).toContain("Icon-dash");
      });
    });

    it("should toggle between true and false states", () => {
      mockOnFilterChange.mockReset();
      render(
        <BooleanPickerCheckbox
          filter={filters.True}
          onFilterChange={mockOnFilterChange}
        />,
      );

      screen.getByText("False").click();

      const newFilter = mockOnFilterChange.mock.calls[0][0];
      expect(newFilter.raw()).toEqual(filters.False.raw());
    });

    it("should remove true/false filter on deselect", () => {
      mockOnFilterChange.mockReset();
      render(
        <BooleanPickerCheckbox
          filter={filters.True}
          onFilterChange={mockOnFilterChange}
        />,
      );

      screen.getByText("True").click();

      const newFilter = mockOnFilterChange.mock.calls[0][0];
      expect(newFilter.raw()).toEqual(invalidFilter.raw());
    });
  });
});
