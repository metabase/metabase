/* eslint-disable @typescript-eslint/ban-ts-comment */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import { createMockMetadata } from "__support__/metadata";

import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import Field from "metabase-lib/metadata/Field";
import Filter from "metabase-lib/queries/structured/Filter";
import Question from "metabase-lib/Question";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { InlineCategoryPickerComponent } from "./InlineCategoryPicker";
import { MAX_INLINE_CATEGORIES } from "./constants";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const smallCategoryField = new Field({
  database_type: "test",
  semantic_type: "type/Category",
  effective_type: "type/Text",
  base_type: "type/Text",
  table_id: 8,
  name: "small_category_field",
  has_field_values: "list",
  values: [["Michaelangelo"], ["Donatello"], ["Raphael"], ["Leonardo"]],
  dimensions: {},
  dimension_options: [],
  id: 137,
  metadata,
});

// we want to make sure we always get enough unique field values
// even if we change MAX_INLINE_CATEGORIES
const turtleFactory = () => {
  const name = ["Michaelangelo", "Donatello", "Raphael", "Leonardo"][
    Math.floor(Math.random() * 4)
  ];
  return [`${name}_${Math.round(Math.random() * 100000)}`];
};

const largeCategoryField = new Field({
  database_type: "test",
  semantic_type: "type/Category",
  effective_type: "type/Text",
  base_type: "type/Text",
  table_id: 8,
  name: "large_category_field",
  has_field_values: "list",
  values: new Array(MAX_INLINE_CATEGORIES + 1).fill(null).map(turtleFactory),
  dimensions: {},
  dimension_options: [],
  id: 138,
  metadata,
});

const emptyCategoryField = new Field({
  database_type: "test",
  semantic_type: "type/Category",
  effective_type: "type/Text",
  base_type: "type/Text",
  table_id: 8,
  name: "empty_category_field",
  has_field_values: "list",
  values: [],
  dimensions: {},
  dimension_options: [],
  id: 139,
  metadata,
});

const nullCategoryField = new Field({
  database_type: "test",
  semantic_type: "type/Category",
  effective_type: "type/Text",
  base_type: "type/Text",
  table_id: 8,
  name: "null_category_field",
  has_field_values: "list",
  values: [[null], [undefined]],
  dimensions: {},
  dimension_options: [],
  id: 140,
  metadata,
});

const remappedCategoryField = new Field({
  database_type: "test",
  semantic_type: "type/Category",
  effective_type: "type/Text",
  base_type: "type/Text",
  table_id: 8,
  name: "small_category_field",
  has_field_values: "list",
  values: [
    ["Michaelangelo", "party turtle"],
    ["Donatello", "engineer turtle"],
    ["Raphael", "cool turtle"],
    ["Leonardo", "leader turtle"],
  ],
  dimensions: {},
  dimension_options: [],
  id: 141,
  metadata,
});

// @ts-ignore
metadata.fields[smallCategoryField.id] = smallCategoryField;
// @ts-ignore
metadata.fields[largeCategoryField.id] = largeCategoryField;
// @ts-ignore
metadata.fields[emptyCategoryField.id] = emptyCategoryField;
// @ts-ignore
metadata.fields[nullCategoryField.id] = nullCategoryField;
// @ts-ignore
metadata.fields[remappedCategoryField.id] = remappedCategoryField;

const card = {
  dataset_query: {
    database: 5,
    query: {
      "source-table": 8,
    },
    type: "query",
  },
  display: "table",
  visualization_settings: {},
};

const question = new Question(card, metadata);
const query = question.query() as StructuredQuery;
const smallDimension = smallCategoryField.dimension();
const largeDimension = largeCategoryField.dimension();
const emptyDimension = emptyCategoryField.dimension();
const nullDimension = nullCategoryField.dimension();
const remappedDimension = remappedCategoryField.dimension();

describe("InlineCategoryPicker", () => {
  beforeEach(() => {
    console.error = jest.fn();
    console.warn = jest.fn();
  });
  it("should render an inline category picker", () => {
    const testFilter = new Filter(
      ["=", ["field", smallCategoryField.id, null], undefined],
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
        dimension={smallDimension}
      />,
    );

    expect(screen.getByTestId("category-picker")).toBeInTheDocument();
    smallCategoryField.values.forEach(([value]) => {
      expect(screen.getByText(value)).toBeInTheDocument();
    });
  });

  it("should render a loading spinner while loading", async () => {
    const testFilter = new Filter(
      ["=", ["field", emptyCategoryField.id, null], undefined],
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
        dimension={emptyDimension}
      />,
    );
    screen.getByTestId("loading-spinner");
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });

  it("should render a warning message on api failure", async () => {
    const testFilter = new Filter(
      ["=", ["field", emptyCategoryField.id, null], undefined],
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
        dimension={emptyDimension}
      />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    screen.getByLabelText("warning icon");
  });

  it(`should render up to ${MAX_INLINE_CATEGORIES} checkboxes`, () => {
    const testFilter = new Filter(
      ["=", ["field", smallCategoryField.id, null], undefined],
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
        dimension={smallDimension}
      />,
    );

    expect(screen.getByTestId("category-picker")).toBeInTheDocument();
    smallCategoryField.values.forEach(([value]) => {
      expect(screen.getByText(value)).toBeInTheDocument();
    });
  });

  it(`should not render more than ${MAX_INLINE_CATEGORIES} checkboxes`, () => {
    const testFilter = new Filter(
      ["=", ["field", largeCategoryField.id, null], undefined],
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
        dimension={largeDimension}
      />,
    );

    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("should load existing filter selections", () => {
    const testFilter = new Filter(
      ["=", ["field", smallCategoryField.id, null], "Donatello", "Leonardo"],
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
        dimension={smallDimension}
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
      ["=", ["field", remappedCategoryField.id, null], "Donatello", "Leonardo"],
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
        dimension={remappedDimension}
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
      ["=", ["field", smallCategoryField.id, null], undefined],
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
        dimension={smallDimension}
      />,
    );

    screen.getByTestId("category-picker");
    userEvent.click(screen.getByLabelText("Raphael"));
    expect(changeSpy.mock.calls.length).toBe(1);
    expect(changeSpy.mock.calls[0][0]).toEqual([
      "=",
      ["field", 137, null],
      "Raphael",
    ]);
  });

  it("should fetch field values data if its not already loaded", async () => {
    const testFilter = new Filter(
      ["=", ["field", emptyCategoryField.id, null], undefined],
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
        dimension={emptyDimension}
      />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    expect(fetchSpy.mock.calls[0][0]).toEqual({ id: emptyCategoryField.id });
  });

  it("should not fetch field values data if it is already present", async () => {
    const testFilter = new Filter(
      ["=", ["field", largeCategoryField.id, null], undefined],
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
        dimension={largeDimension}
      />,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should render a value picker if there are many options", () => {
    const testFilter = new Filter(
      ["=", ["field", largeCategoryField.id, null], undefined],
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
        dimension={largeDimension}
      />,
    );

    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("should render a value picker for no valid options", () => {
    // the small category picker would just render no checkboxes which looks funny
    const testFilter = new Filter(
      ["=", ["field", nullCategoryField.id, null], undefined],
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
        dimension={nullDimension}
      />,
    );

    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("should show field options inline for category fields with many options", () => {
    const testFilter = new Filter(
      ["=", ["field", largeCategoryField.id, null], "Raphael 2", "Donatello 3"],
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
        dimension={largeDimension}
      />,
    );

    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
    expect(screen.getByText("Raphael 2")).toBeInTheDocument();
    expect(screen.getByText("Donatello 3")).toBeInTheDocument();
  });

  const fieldSizes = [
    { name: "large", field: largeCategoryField, dimension: largeDimension },
    { name: "small", field: smallCategoryField, dimension: smallDimension },
  ];

  fieldSizes.forEach(({ name, field, dimension }) => {
    it(`should fall back to value picker if the filter operator is not = or != with a ${name} set of field values`, () => {
      const testFilter = new Filter(
        ["contains", ["field", field.id, null], undefined],
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
