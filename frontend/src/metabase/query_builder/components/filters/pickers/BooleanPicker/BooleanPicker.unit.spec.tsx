import { render, screen } from "@testing-library/react";
import { createMockMetadata } from "__support__/metadata";

import { checkNotNull } from "metabase/core/utils/types";

import { createMockField } from "metabase-types/api/mocks";
import { createAdHocCard } from "metabase-types/api/mocks/presets";

import Question from "metabase-lib/Question";
import Filter from "metabase-lib/queries/structured/Filter";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import BooleanPicker, { BooleanPickerCheckbox } from "./index";

const mockOnFilterChange = jest.fn();

function setup(filter: Filter) {
  mockOnFilterChange.mockReset();
  return render(
    <BooleanPicker filter={filter} onFilterChange={mockOnFilterChange} />,
  );
}

describe("BooleanPicker", () => {
  const metadata = createMockMetadata({
    fields: [
      createMockField({
        id: 1,
        base_type: "type/Boolean",
        effective_type: "type/Boolean",
      }),
    ],
  });

  const field = checkNotNull(metadata.field(1));

  const question = new Question(createAdHocCard(), metadata);
  const query = question.query() as StructuredQuery;

  const fieldRef = field.reference();

  const filters = {
    True: new Filter(["=", fieldRef, true], null, query),
    False: new Filter(["=", fieldRef, false], null, query),
    Empty: new Filter(["is-null", fieldRef], null, query),
    "Not empty": new Filter(["not-null", fieldRef], null, query),
  };

  // @ts-expect-error — testing invalid filter clause
  const invalidFilter = new Filter(["=", fieldRef], query);

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

      expect(option).toBeChecked();
      expect(screen.getByLabelText("Not empty")).toBeInTheDocument();
    });

    Object.entries(filters).forEach(([label, filter]) => {
      it(`should have the "${label}" option selected when given the associated filter`, () => {
        setup(filter);
        expect(screen.getByLabelText(label)).toBeChecked();
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
