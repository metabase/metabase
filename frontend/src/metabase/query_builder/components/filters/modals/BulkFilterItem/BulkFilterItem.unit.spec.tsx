// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import React from "react";
import { render, screen } from "@testing-library/react";
import { metadata } from "__support__/sample_database_fixture";

import Field from "metabase-lib/lib/metadata/Field";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Question from "metabase-lib/lib/Question";

import { BulkFilterItem } from "./BulkFilterItem";

const booleanField = new Field({
  database_type: "test",
  semantic_type: "",
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

const intField = new Field({
  database_type: "test",
  semantic_type: "",
  table_id: 8,
  name: "int_num",
  has_field_values: "list",
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Integer",
  id: 135,
  base_type: "type/Integer",
  metadata,
});

const floatField = new Field({
  database_type: "test",
  semantic_type: "",
  table_id: 8,
  name: "float_num",
  has_field_values: "list",
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Float",
  id: 136,
  base_type: "type/Float",
  metadata,
});

metadata.fields[booleanField.id] = booleanField;
metadata.fields[intField.id] = intField;
metadata.fields[floatField.id] = floatField;

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

    expect(screen.getByLabelText("true")).toBeChecked();
    expect(screen.getByLabelText("false")).not.toBeChecked();
  });

  it("renders a bulk filter select for integer field type", () => {
    const testFilter = new Filter(
      ["=", ["field", intField.id, null], 99],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={intDimension}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );

    expect(screen.queryByText("true")).toBeNull();
    expect(screen.getByTestId("select-button")).toHaveAttribute(
      "aria-label",
      "int_num",
    );
  });

  it("renders a bulk filter select for float field type", () => {
    const testFilter = new Filter(
      ["=", ["field", floatField.id, null], 99],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={floatDimension}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.queryByText("true")).toBeNull();
    expect(screen.getByTestId("select-button")).toHaveAttribute(
      "aria-label",
      "float_num",
    );
  });
});
