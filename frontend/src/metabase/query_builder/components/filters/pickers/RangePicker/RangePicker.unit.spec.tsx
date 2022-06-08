// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { metadata } from "__support__/sample_database_fixture";

import Question from "metabase-lib/lib/Question";
import Field from "metabase-lib/lib/metadata/Field";
import Filter from "metabase-lib/lib/queries/structured/Filter";

import RangePicker from "./index";

const intField = new Field({
  database_type: "type/Integer",
  semantic_type: "",
  table_id: 8,
  name: "int_num",
  has_field_values: "list",
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Integer",
  id: 134,
  base_type: "type/Integer",
  metadata,
});

const floatField = new Field({
  database_type: "type/Float",
  semantic_type: "",
  table_id: 8,
  name: "float_num",
  has_field_values: "list",
  dimensions: {},
  dimension_options: [],
  effective_type: "type/Float",
  id: 135,
  base_type: "type/Float",
  metadata,
});

metadata.fields[intField.id] = intField;
metadata.fields[floatField.id] = floatField;

const intFieldRef = ["field", 134, null];
const floatFieldRef = ["field", 135, null];

const intCard = {
  dataset_query: {
    database: 5,
    query: {
      "source-table": 8,
      filter: ["=", intFieldRef, true],
    },
    type: "query",
  },
  display: "table",
  visualization_settings: {},
};

const floatCard = {
  dataset_query: {
    database: 5,
    query: {
      "source-table": 8,
      filter: ["=", floatFieldRef, true],
    },
    type: "query",
  },
  display: "table",
  visualization_settings: {},
};

const intQuestion = new Question(intCard, metadata);
const floatQuestion = new Question(floatCard, metadata);

const createFilters = (fieldRef, question) => ({
  gte: new Filter([">=", fieldRef, 16], null, question.query()),
  lte: new Filter(["<=", fieldRef, 17], null, question.query()),
  eq: new Filter(["=", fieldRef, 18], null, question.query()),
  noteq: new Filter(["!=", fieldRef, 18], null, question.query()),
  between: new Filter(["between", fieldRef, 19, 20], null, question.query()),
  empty: new Filter(["=", fieldRef], null, question.query()),
});

const filters = createFilters(intFieldRef, intQuestion);
const floatFilters = createFilters(floatFieldRef, floatQuestion);

describe("RangePicker", () => {
  Object.keys(filters).forEach(filterName => {
    it(`renders a range slider and two text inputs for an integer ${filterName} filter`, () => {
      const changeSpy = jest.fn();
      render(
        <RangePicker
          filter={filters[filterName]}
          onFilterChange={changeSpy}
          field={intField}
        />,
      );
      screen.getByLabelText("min");
      screen.getByLabelText("max");
      screen.getByPlaceholderText("min");
      screen.getByPlaceholderText("max");
    });
  });

  Object.keys(floatFilters).forEach(filterName => {
    it(`renders a range slider and two text inputs for an integer ${filterName} filter`, () => {
      const changeSpy = jest.fn();
      render(
        <RangePicker
          filter={floatFilters[filterName]}
          onFilterChange={changeSpy}
          field={floatField}
        />,
      );
      screen.getByLabelText("min");
      screen.getByLabelText("max");
      screen.getByPlaceholderText("min");
      screen.getByPlaceholderText("max");
    });
  });

  it("renders an empty filter with empty text fields and range sliders at the ends of the input", () => {
    const changeSpy = jest.fn();
    render(
      <RangePicker
        filter={filters.empty}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );
    const inputs = getInputs();

    expect(inputs.minRangeInput).toHaveValue("0");
    expect(inputs.maxRangeInput).toHaveValue("100");

    expect(inputs.minTextInput).toHaveValue("");
    expect(inputs.maxTextInput).toHaveValue("");
  });

  it("correctly renders an existing number filter", () => {
    const changeSpy = jest.fn();
    render(
      <RangePicker
        filter={filters.gte}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );

    const inputs = getInputs();

    expect(inputs.minRangeInput).toHaveValue("16");
    expect(inputs.maxRangeInput).toHaveValue("100");

    expect(inputs.minTextInput).toHaveValue("16");
    expect(inputs.maxTextInput).toHaveValue("");
  });

  it("updates the filter when the slider is moved", () => {
    const changeSpy = jest.fn();
    render(
      <RangePicker
        filter={filters.gte}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );

    const inputs = getInputs();

    fireEvent.change(inputs.minRangeInput, { target: { value: "64" } });
    fireEvent.mouseUp(inputs.minRangeInput);

    const newFilter = changeSpy.mock.calls[0][0];
    expect(newFilter.arguments()).toEqual([64]);
  });

  it("updates the filter when the text input is modified", () => {
    const changeSpy = jest.fn();

    render(
      <RangePicker
        filter={filters.gte}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );

    const inputs = getInputs();

    fireEvent.change(inputs.minTextInput, { target: { value: "64" } });

    const newFilter = changeSpy.mock.calls[0][0];
    expect(newFilter.arguments()).toEqual([64]);
  });

  it("clears filter arguments when inputs are at max and min values", () => {
    const changeSpy = jest.fn();

    render(
      <RangePicker
        filter={filters.gte}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );
    const inputs = getInputs();

    fireEvent.change(inputs.minRangeInput, { target: { value: "0" } });
    fireEvent.mouseUp(inputs.minRangeInput);

    const newFilter = changeSpy.mock.calls[0][0];

    expect(newFilter.isValid()).toBe(false);
  });

  it("creates a >= filter when only the min input has a value", () => {
    const changeSpy = jest.fn();
    render(
      <RangePicker
        filter={filters.empty}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );
    const inputs = getInputs();

    fireEvent.change(inputs.minTextInput, { target: { value: "64" } });

    const newFilter = changeSpy.mock.calls[0][0];
    expect(newFilter.operator().name).toEqual(">=");
  });

  it("creates a <= filter when only the max input has a value", () => {
    const changeSpy = jest.fn();
    render(
      <RangePicker
        filter={filters.empty}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );
    const inputs = getInputs();

    fireEvent.change(inputs.maxTextInput, { target: { value: "64" } });

    const newFilter = changeSpy.mock.calls[0][0];
    expect(newFilter.operator().name).toEqual("<=");
  });

  it("creates a between filter when both inputs have values", () => {
    const changeSpy = jest.fn();
    render(
      <RangePicker
        filter={filters.gte}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );
    const inputs = getInputs();

    fireEvent.change(inputs.maxTextInput, { target: { value: "64" } });

    const newFilter = changeSpy.mock.calls[0][0];
    expect(newFilter.operator().name).toEqual("between");
  });

  it("creates an invalid filter when neither input has a value", () => {
    const changeSpy = jest.fn();

    render(
      <RangePicker
        filter={filters.lte}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );
    const clearInput = screen.getByLabelText("close icon");
    fireEvent.click(clearInput);

    const newFilter = changeSpy.mock.calls[0][0];

    expect(newFilter.isValid()).toBe(false);
  });

  it("creates an = filter when the min and max inputs have the same value", () => {
    const changeSpy = jest.fn();
    render(
      <RangePicker
        filter={filters.between}
        onFilterChange={changeSpy}
        field={intField}
      />,
    );
    const inputs = getInputs();
    fireEvent.change(inputs.minTextInput, { target: { value: "20" } });

    const newFilter = changeSpy.mock.calls[0][0];
    expect(newFilter.operator().name).toEqual("=");
  });
});

function getInputs() {
  return {
    minRangeInput: screen.getByLabelText("min"),
    maxRangeInput: screen.getByLabelText("max"),
    minTextInput: screen.getByPlaceholderText("min"),
    maxTextInput: screen.getByPlaceholderText("max"),
  };
}
