// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";

import { getStore } from "__support__/entities-store";
import { metadata } from "__support__/sample_database_fixture";

import Field from "metabase-lib/lib/metadata/Field";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Question from "metabase-lib/lib/Question";

import { InlineValuePicker } from "./InlineValuePicker";

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
const store = getStore();

describe("InlineValuePicker", () => {
  it("renders an inline value picker with values fields", () => {
    const testFilter = new Filter(
      ["=", ["field", pkField.id, null], undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineValuePicker
          filter={testFilter}
          field={pkField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    screen.getByTestId("value-picker");
    screen.getByPlaceholderText("Enter an ID");
  });

  it("loads an existing set of key filter values", () => {
    const testFilter = new Filter(
      ["=", ["field", pkField.id, null], 777, 888],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineValuePicker
          filter={testFilter}
          field={pkField}
          handleChange={changeSpy}
        />
      </Provider>,
    );
    screen.getByText("777");
    screen.getByText("888");
  });

  it("loads an existing set of text filter values", async () => {
    const testFilter = new Filter(
      ["!=", ["field", textField.id, null], "fooBarBaz", "BazBarFoo"],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineValuePicker
          filter={testFilter}
          field={textField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    screen.getByText("fooBarBaz");
    screen.getByText("BazBarFoo");
  });

  it("adds additional filter values", () => {
    const testFilter = new Filter(
      ["=", ["field", pkField.id, null], undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineValuePicker
          filter={testFilter}
          field={pkField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    const textInput = screen.getByPlaceholderText("Enter an ID");
    userEvent.type(textInput, "456");

    expect(changeSpy).toHaveBeenCalledTimes(3);
    const changes = changeSpy.mock.calls;
    expect(changes[0][0].arguments()).toEqual([4]);
    expect(changes[1][0].arguments()).toEqual([45]);
    expect(changes[2][0].arguments()).toEqual([456]);
  });

  it("removes filter values", async () => {
    const testFilter = new Filter(
      ["=", ["field", pkField.id, null], 777, 888],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineValuePicker
          filter={testFilter}
          field={pkField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    // click remove on the first data item, which is 777
    const [firstDataItem] = await screen.getAllByLabelText("close icon");
    userEvent.click(firstDataItem);
    expect(changeSpy).toHaveBeenCalled();
    expect(changeSpy.mock.calls[0][0].arguments()).toEqual([888]);
  });

  it("tokenizes inputs for multi-input operators", async () => {
    let testFilter = new Filter(
      ["=", ["field", textField.id, null]],
      null,
      query,
    );
    const changeSpy = jest.fn(newFilter => (testFilter = newFilter));

    render(
      <Provider store={store}>
        <InlineValuePicker
          filter={testFilter}
          field={textField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    const textInput = screen.getByPlaceholderText("Enter some text");
    userEvent.type(textInput, "foo,bar,");
    changeSpy.mock.calls.forEach(([[_, __, value]]) => {
      // passed value will never contain a comma because the tokenizer will filter it out
      expect(value).not.toContain(",");
    });
  });

  it("does not tokenize input for single-input operators", async () => {
    const testFilter = new Filter(
      ["contains", ["field", textField.id, null]],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineValuePicker
          filter={testFilter}
          field={textField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    const textInput = screen.getByPlaceholderText("Enter some text");
    userEvent.type(textInput, "foo,bar,");

    const lastCall = changeSpy.mock.calls[changeSpy.mock.calls.length - 1][0];
    // reads commas as part of the input instead of token separators
    expect(lastCall[2]).toEqual("foo,bar,");
  });

  it("shows multiple inputs for between filters", async () => {
    const testFilter = new Filter(
      ["between", ["field", pkField.id, null], 14, 74],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineValuePicker
          filter={testFilter}
          field={pkField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    screen.getByPlaceholderText("Min");
    screen.getByPlaceholderText("Max");
  });

  const noValueOperators = ["is-null", "not-null", "is-empty", "not-empty"];

  noValueOperators.forEach(op => {
    it(`hides value input for ${op} empty operator`, () => {
      const testFilter = new Filter(
        [op, ["field", textField.id, null]],
        null,
        query,
      );
      const changeSpy = jest.fn();

      render(
        <Provider store={store}>
          <InlineValuePicker
            filter={testFilter}
            field={textField}
            handleChange={changeSpy}
          />
        </Provider>,
      );

      expect(
        screen.queryByPlaceholderText("Enter some text"),
      ).not.toBeInTheDocument();
    });
  });
});
