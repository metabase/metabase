// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import React from "react";
import { render, screen } from "@testing-library/react";
import { metadata } from "__support__/sample_database_fixture";
import { getStore } from "__support__/entities-store";
import { Provider } from "react-redux";

import Field from "metabase-lib/lib/metadata/Field";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Question from "metabase-lib/lib/Question";

import { BulkFilterItem } from "./BulkFilterItem";

const booleanField = new Field({
  database_type: "test",
  semantic_type: "",
  table_id: 8,
  name: "bool",
  has_field_values: "none",
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Boolean",
  id: 134,
  base_type: "type/Boolean",
  metadata,
});

const intField = new Field({
  database_type: "test",
  semantic_type: "type/Integer",
  table_id: 8,
  name: "int_num",
  has_field_values: "none",
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Integer",
  id: 135,
  base_type: "type/Integer",
  metadata,
});

const floatField = new Field({
  database_type: "test",
  semantic_type: "type/Integer",
  table_id: 8,
  name: "float_num",
  has_field_values: "none",
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Float",
  id: 136,
  base_type: "type/Float",
  metadata,
});

const categoryField = new Field({
  database_type: "test",
  semantic_type: "",
  table_id: 8,
  name: "category_string",
  has_field_values: "list",
  values: [["Michaelangelo"], ["Donatello"], ["Raphael"], ["Leonardo"]],
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Text",
  id: 137,
  base_type: "type/Text",
  metadata,
});

const pkField = new Field({
  database_type: "test",
  semantic_type: "type/PK",
  table_id: 8,
  name: "pk_field",
  has_field_values: "none",
  values: [],
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Integer",
  id: 138,
  base_type: "type/Integer",
  metadata,
});

const fkField = new Field({
  database_type: "test",
  semantic_type: "type/FK",
  table_id: 8,
  name: "fk_field",
  has_field_values: "none",
  values: [],
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Integer",
  id: 139,
  base_type: "type/Integer",
  metadata,
});

const textField = new Field({
  database_type: "test",
  semantic_type: "",
  table_id: 8,
  name: "text_field",
  has_field_values: "none",
  values: [],
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Text",
  id: 140,
  base_type: "type/Text",
  metadata,
});

metadata.fields[booleanField.id] = booleanField;
metadata.fields[intField.id] = intField;
metadata.fields[floatField.id] = floatField;
metadata.fields[categoryField.id] = categoryField;
metadata.fields[pkField.id] = pkField;
metadata.fields[fkField.id] = fkField;
metadata.fields[textField.id] = textField;

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
const query = question.query();
const booleanDimension = booleanField.dimension();
const floatDimension = floatField.dimension();
const intDimension = intField.dimension();
const categoryDimension = categoryField.dimension();
const pkDimension = pkField.dimension();
const fkDimension = fkField.dimension();
const textDimension = textField.dimension();

const store = getStore();

describe("BulkFilterItem", () => {
  it("renders a boolean picker for a boolean filter", () => {
    const testFilter = new Filter(
      ["=", ["field", booleanField.id, null], true],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={booleanDimension}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );

    expect(screen.getByLabelText("True")).toBeChecked();
    expect(screen.getByLabelText("False")).not.toBeChecked();
  });

  it("renders a value picker integer field type", () => {
    const testFilter = new Filter(
      ["=", ["field", intField.id, null], 99],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <BulkFilterItem
          query={query}
          filter={testFilter}
          dimension={intDimension}
          onAddFilter={changeSpy}
          onChangeFilter={changeSpy}
          onRemoveFilter={changeSpy}
        />
      </Provider>,
    );

    screen.getByTestId("value-picker");
  });

  it("renders a value picker for float field type", () => {
    const testFilter = new Filter(
      ["=", ["field", floatField.id, null], 99],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <BulkFilterItem
          query={query}
          filter={testFilter}
          dimension={floatDimension}
          onAddFilter={changeSpy}
          onChangeFilter={changeSpy}
          onRemoveFilter={changeSpy}
        />
      </Provider>,
    );
    screen.getByTestId("value-picker");
  });

  it("defaults to a between picker for float field type", () => {
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <BulkFilterItem
          query={query}
          filter={undefined}
          dimension={floatDimension}
          onAddFilter={changeSpy}
          onChangeFilter={changeSpy}
          onRemoveFilter={changeSpy}
        />
      </Provider>,
    );
    screen.getByTestId("value-picker");
    screen.getByText(/between/i);
    screen.getByPlaceholderText("Min");
    screen.getByPlaceholderText("Max");
  });

  it("renders a category picker for category type", () => {
    const testFilter = new Filter(
      ["=", ["field", categoryField.id, null], "Donatello"],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <BulkFilterItem
          query={query}
          filter={testFilter}
          dimension={categoryDimension}
          onAddFilter={changeSpy}
          onChangeFilter={changeSpy}
          onRemoveFilter={changeSpy}
        />
      </Provider>,
    );
    screen.getByTestId("category-picker");
  });

  it("renders a value picker for a primary key", () => {
    const testFilter = new Filter(
      ["=", ["field", pkField.id, null], 1],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <BulkFilterItem
          query={query}
          filter={testFilter}
          dimension={pkDimension}
          onAddFilter={changeSpy}
          onChangeFilter={changeSpy}
          onRemoveFilter={changeSpy}
        />
      </Provider>,
    );
    screen.getByTestId("value-picker");
  });

  it("renders a value picker for a foreign key", () => {
    const testFilter = new Filter(
      ["=", ["field", fkField.id, null], 1],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <BulkFilterItem
          query={query}
          filter={testFilter}
          dimension={fkDimension}
          onAddFilter={changeSpy}
          onChangeFilter={changeSpy}
          onRemoveFilter={changeSpy}
        />
      </Provider>,
    );
    screen.getByTestId("value-picker");
  });

  it("renders a value picker for a text field", () => {
    const testFilter = new Filter(
      ["contains", ["field", textField.id, null], "foo"],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <BulkFilterItem
          query={query}
          filter={testFilter}
          dimension={textDimension}
          onAddFilter={changeSpy}
          onChangeFilter={changeSpy}
          onRemoveFilter={changeSpy}
        />
      </Provider>,
    );
    screen.getByTestId("value-picker");
    screen.getByText("foo");
  });

  it("defaults key filters to 'is' operator", () => {
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <BulkFilterItem
          query={query}
          filter={undefined}
          dimension={fkDimension}
          onAddFilter={changeSpy}
          onChangeFilter={changeSpy}
          onRemoveFilter={changeSpy}
        />
      </Provider>,
    );
    screen.getByText(/is/i);
  });

  it("defaults text filters to 'contains' operator", () => {
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <BulkFilterItem
          query={query}
          filter={undefined}
          dimension={textDimension}
          onAddFilter={changeSpy}
          onChangeFilter={changeSpy}
          onRemoveFilter={changeSpy}
        />
      </Provider>,
    );
    screen.getByText(/contains/i);
  });
});
