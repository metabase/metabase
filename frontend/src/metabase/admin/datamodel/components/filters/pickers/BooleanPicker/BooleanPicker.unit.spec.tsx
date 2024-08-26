import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import Question from "metabase-lib/v1/Question";
import type StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import Filter from "metabase-lib/v1/queries/structured/Filter";
import { createMockField } from "metabase-types/api/mocks";
import { createAdHocCard } from "metabase-types/api/mocks/presets";

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
  const query = question.legacyQuery({
    useStructuredQuery: true,
  }) as StructuredQuery;

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
    it("should hide empty options when empty options are not selected", async () => {
      setup(filters.True);

      expect(screen.queryByLabelText("Empty")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Not empty")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("More options"));

      expect(await screen.findByLabelText("Empty")).toBeInTheDocument();
      expect(await screen.findByLabelText("Not empty")).toBeInTheDocument();
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

      it(`should correctly update the filter for the "${label}" option when it is selected`, async () => {
        setup(label === "True" ? filters.False : filters.True);

        await userEvent.click(screen.getByText("More options"));

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

    it("should toggle between true and false states", async () => {
      mockOnFilterChange.mockReset();
      render(
        <BooleanPickerCheckbox
          filter={filters.True}
          onFilterChange={mockOnFilterChange}
        />,
      );

      await userEvent.click(screen.getByText("False"));

      const newFilter = mockOnFilterChange.mock.calls[0][0];
      expect(newFilter.raw()).toEqual(filters.False.raw());
    });

    it("should remove true/false filter on deselect", async () => {
      mockOnFilterChange.mockReset();
      render(
        <BooleanPickerCheckbox
          filter={filters.True}
          onFilterChange={mockOnFilterChange}
        />,
      );

      await userEvent.click(screen.getByText("True"));

      const newFilter = mockOnFilterChange.mock.calls[0][0];
      expect(newFilter.raw()).toEqual(invalidFilter.raw());
    });
  });
});
