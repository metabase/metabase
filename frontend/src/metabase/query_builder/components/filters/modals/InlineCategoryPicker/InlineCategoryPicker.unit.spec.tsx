import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders } from "__support__/ui";

import { checkNotNull } from "metabase/core/utils/types";

import type { Field, FieldValue } from "metabase-types/api";
import { createMockField } from "metabase-types/api/mocks";
import { createAdHocCard } from "metabase-types/api/mocks/presets";

import Question from "metabase-lib/Question";
import Filter from "metabase-lib/queries/structured/Filter";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { MAX_INLINE_CATEGORIES } from "./constants";
import { InlineCategoryPickerComponent } from "./InlineCategoryPicker";

// we want to make sure we always get enough unique field values
// even if we change MAX_INLINE_CATEGORIES
const turtleFactory = (): FieldValue => {
  const name = ["Michaelangelo", "Donatello", "Raphael", "Leonardo"][
    Math.floor(Math.random() * 4)
  ];
  return [`${name}_${Math.round(Math.random() * 100000)}`];
};

function createCategoryField(opts?: Partial<Field>): Field {
  return createMockField({
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Category",
    has_field_values: "list",
    ...opts,
  });
}

const SMALL_CATEGORY_FIELD_ID = 1;
const LARGE_CATEGORY_FIELD_ID = 2;
const EMPTY_CATEGORY_FIELD = 3;
const NULL_CATEGORY_FIELD = 4;
const REMAPPED_CATEGORY_FIELD = 5;

describe("InlineCategoryPicker", () => {
  const metadata = createMockMetadata({
    fields: [
      createCategoryField({
        id: SMALL_CATEGORY_FIELD_ID,
        values: [["Michaelangelo"], ["Donatello"], ["Raphael"], ["Leonardo"]],
      }),
      createCategoryField({
        id: LARGE_CATEGORY_FIELD_ID,
        values: new Array(MAX_INLINE_CATEGORIES + 1)
          .fill(null)
          .map(turtleFactory),
      }),
      createCategoryField({
        id: EMPTY_CATEGORY_FIELD,
        values: [],
      }),
      createCategoryField({
        id: NULL_CATEGORY_FIELD,
        values: [[null]],
      }),
      createCategoryField({
        id: REMAPPED_CATEGORY_FIELD,
        values: [
          ["Michaelangelo", "party turtle"],
          ["Donatello", "engineer turtle"],
          ["Raphael", "cool turtle"],
          ["Leonardo", "leader turtle"],
        ],
      }),
    ],
  });

  const question = new Question(createAdHocCard(), metadata);
  const query = question.query() as StructuredQuery;

  const smallCategoryField = checkNotNull(
    metadata.field(SMALL_CATEGORY_FIELD_ID),
  );
  const largeCategoryField = checkNotNull(
    metadata.field(LARGE_CATEGORY_FIELD_ID),
  );
  const emptyCategoryField = checkNotNull(metadata.field(EMPTY_CATEGORY_FIELD));
  const nullCategoryField = checkNotNull(metadata.field(NULL_CATEGORY_FIELD));
  const remappedCategoryField = checkNotNull(
    metadata.field(REMAPPED_CATEGORY_FIELD),
  );

  it("should render an inline category picker", () => {
    const testFilter = new Filter(
      ["=", smallCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    render(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={smallCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={smallCategoryField.dimension()}
      />,
    );

    expect(screen.getByTestId("category-picker")).toBeInTheDocument();
    smallCategoryField.values.forEach(([value]) => {
      expect(screen.getByText(value)).toBeInTheDocument();
    });
  });

  it("should render a loading spinner while loading", async () => {
    const testFilter = new Filter(
      ["=", emptyCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    render(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={emptyCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={emptyCategoryField.dimension()}
      />,
    );
    screen.getByTestId("loading-spinner");
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });

  it("should render a warning message on api failure", async () => {
    const testFilter = new Filter(
      ["=", emptyCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    render(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={emptyCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={emptyCategoryField.dimension()}
      />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    screen.getByLabelText("warning icon");
  });

  it(`should render up to ${MAX_INLINE_CATEGORIES} checkboxes`, () => {
    const testFilter = new Filter(
      ["=", smallCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    render(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={smallCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={smallCategoryField.dimension()}
      />,
    );

    expect(screen.getByTestId("category-picker")).toBeInTheDocument();
    smallCategoryField.values.forEach(([value]) => {
      expect(screen.getByText(value)).toBeInTheDocument();
    });
  });

  it(`should not render more than ${MAX_INLINE_CATEGORIES} checkboxes`, () => {
    const testFilter = new Filter(
      ["=", largeCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    renderWithProviders(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={largeCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={largeCategoryField.dimension()}
      />,
    );

    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("should load existing filter selections", () => {
    const testFilter = new Filter(
      ["=", smallCategoryField.reference(), "Donatello", "Leonardo"],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    render(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={smallCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={smallCategoryField.dimension()}
      />,
    );

    screen.getByTestId("category-picker");
    expect(screen.getByLabelText("Donatello")).toBeChecked();
    expect(screen.getByLabelText("Leonardo")).toBeChecked();
    expect(screen.getByLabelText("Raphael")).not.toBeChecked();
    expect(screen.getByLabelText("Michaelangelo")).not.toBeChecked();
  });

  it("should display remapped field values if present", () => {
    const testFilter = new Filter(
      ["=", remappedCategoryField.reference(), "Donatello", "Leonardo"],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    render(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={remappedCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={remappedCategoryField.dimension()}
      />,
    );

    screen.getByTestId("category-picker");
    expect(screen.getByLabelText("engineer turtle")).toBeChecked();
    expect(screen.getByLabelText("leader turtle")).toBeChecked();
    expect(screen.getByLabelText("cool turtle")).not.toBeChecked();
    expect(screen.getByLabelText("party turtle")).not.toBeChecked();
  });

  it("should save a filter based on selection", () => {
    const testFilter = new Filter(
      ["=", smallCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    render(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={smallCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={smallCategoryField.dimension()}
      />,
    );

    screen.getByTestId("category-picker");
    userEvent.click(screen.getByLabelText("Raphael"));
    expect(changeSpy.mock.calls.length).toBe(1);
    expect(changeSpy.mock.calls[0][0]).toEqual([
      "=",
      smallCategoryField.reference(),
      "Raphael",
    ]);
  });

  it("should fetch field values data if its not already loaded", async () => {
    const testFilter = new Filter(
      ["=", emptyCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    render(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={emptyCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={emptyCategoryField.dimension()}
      />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    expect(fetchSpy.mock.calls[0][0]).toEqual({ id: emptyCategoryField.id });
  });

  it("should not fetch field values data if it is already present", async () => {
    const testFilter = new Filter(
      ["=", largeCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    renderWithProviders(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={largeCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={largeCategoryField.dimension()}
      />,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should render a value picker if there are many options", () => {
    const testFilter = new Filter(
      ["=", largeCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    renderWithProviders(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={largeCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={largeCategoryField.dimension()}
      />,
    );

    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("should render a value picker for no valid options", () => {
    // the small category picker would just render no checkboxes which looks funny
    const testFilter = new Filter(
      ["=", nullCategoryField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    renderWithProviders(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={nullCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={nullCategoryField.dimension()}
      />,
    );

    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("should show field options inline for category fields with many options", () => {
    const testFilter = new Filter(
      ["=", largeCategoryField.reference(), "Raphael 2", "Donatello 3"],
      null,
      query,
    );
    const changeSpy = jest.fn();
    const fetchSpy = jest.fn();

    renderWithProviders(
      <InlineCategoryPickerComponent
        filter={testFilter}
        newFilter={testFilter}
        onChange={changeSpy}
        fieldValues={largeCategoryField.values}
        fetchFieldValues={fetchSpy}
        dimension={largeCategoryField.dimension()}
      />,
    );

    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
    expect(screen.getByText("Raphael 2")).toBeInTheDocument();
    expect(screen.getByText("Donatello 3")).toBeInTheDocument();
  });

  const fieldSizes = [
    {
      name: "large",
      field: largeCategoryField,
      dimension: largeCategoryField.dimension(),
    },
    {
      name: "small",
      field: smallCategoryField,
      dimension: smallCategoryField.dimension(),
    },
  ];

  fieldSizes.forEach(({ name, field, dimension }) => {
    it(`should fall back to value picker if the filter operator is not = or != with a ${name} set of field values`, () => {
      const testFilter = new Filter(
        ["contains", field.reference(), undefined],
        null,
        query,
      );
      const changeSpy = jest.fn();
      const fetchSpy = jest.fn();

      renderWithProviders(
        <InlineCategoryPickerComponent
          filter={testFilter}
          newFilter={testFilter}
          onChange={changeSpy}
          fieldValues={field.values}
          fetchFieldValues={fetchSpy}
          dimension={dimension}
        />,
      );

      expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
      expect(screen.getByTestId("value-picker")).toBeInTheDocument();
    });
  });
});
