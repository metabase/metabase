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

import { InlineKeyPicker } from "./InlineValuePicker";

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
  effective_type: "type/Integer",
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
  effective_type: "type/Integer",
  metadata,
});

metadata.fields[pkField.id] = pkField;
metadata.fields[fkField.id] = fkField;

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
const pkDimension = pkField.dimension();
const fkDimenion = fkField.dimension();

const store = getStore();

describe("InlineKeyPicker", () => {
  it("renders an inline key picker with operator and values fields", () => {
    const testFilter = new Filter(
      ["=", ["field", pkField.id, null], undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineKeyPicker
          filter={testFilter}
          field={pkField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    screen.getByTestId("key-picker");
    screen.getByTestId("select-button");
    screen.getByPlaceholderText("Enter IDs");
  });

  it("loads an existing set of filter values", () => {
    const testFilter = new Filter(
      ["=", ["field", pkField.id, null], 777, 888],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineKeyPicker
          filter={testFilter}
          field={pkField}
          handleChange={changeSpy}
        />
      </Provider>,
    );
    screen.getByText("777");
    screen.getByText("888");
  });

  it("changes the filter operator", () => {
    const testFilter = new Filter(
      ["=", ["field", pkField.id, null], undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();

    render(
      <Provider store={store}>
        <InlineKeyPicker
          filter={testFilter}
          field={pkField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    screen.getByTestId("select-button").click();
    screen.getByText("Is not").click();
    expect(changeSpy).toHaveBeenCalled();
    expect(changeSpy.mock.calls[0][0].operatorName()).toEqual("!=");
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
        <InlineKeyPicker
          filter={testFilter}
          field={pkField}
          handleChange={changeSpy}
        />
      </Provider>,
    );

    const textInput = screen.getByPlaceholderText("Enter IDs");
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
        <InlineKeyPicker
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
});
