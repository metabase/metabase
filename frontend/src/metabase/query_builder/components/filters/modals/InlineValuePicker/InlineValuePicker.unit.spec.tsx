import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "__support__/ui";
import { createMockMetadata } from "__support__/metadata";

import { checkNotNull } from "metabase/core/utils/types";

import { createMockField } from "metabase-types/api/mocks";
import { createAdHocCard } from "metabase-types/api/mocks/presets";

import Filter from "metabase-lib/queries/structured/Filter";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { InlineValuePicker } from "./InlineValuePicker";

const PK_FIELD_ID = 1;
const TEXT_FIELD_ID = 2;

describe("InlineValuePicker", () => {
  const metadata = createMockMetadata({
    fields: [
      createMockField({
        id: PK_FIELD_ID,
        base_type: "type/Integer",
        effective_type: "type/Integer",
        semantic_type: "type/PK",
        has_field_values: "none",
      }),
      createMockField({
        id: TEXT_FIELD_ID,
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: null,
      }),
    ],
  });

  const question = new Question(createAdHocCard(), metadata);
  const query = question.query() as StructuredQuery;

  const pkField = checkNotNull(metadata.field(PK_FIELD_ID));
  const textField = checkNotNull(metadata.field(TEXT_FIELD_ID));

  it("renders an inline value picker with values fields", () => {
    const testFilter = new Filter(
      ["=", pkField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <InlineValuePicker
        filter={testFilter}
        field={pkField}
        handleChange={changeSpy}
      />,
    );

    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter an ID")).toBeInTheDocument();
  });

  it("loads an existing set of key filter values", () => {
    const testFilter = new Filter(
      ["=", pkField.reference(), 777, 888],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <InlineValuePicker
        filter={testFilter}
        field={pkField}
        handleChange={changeSpy}
      />,
    );
    expect(screen.getByText("777")).toBeInTheDocument();
    expect(screen.getByText("888")).toBeInTheDocument();
  });

  it("loads an existing set of text filter values", async () => {
    const testFilter = new Filter(
      ["!=", textField.reference(), "fooBarBaz", "BazBarFoo"],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <InlineValuePicker
        filter={testFilter}
        field={textField}
        handleChange={changeSpy}
      />,
    );

    expect(screen.getByText("fooBarBaz")).toBeInTheDocument();
    expect(screen.getByText("BazBarFoo")).toBeInTheDocument();
  });

  it("adds additional filter values", () => {
    const testFilter = new Filter(
      ["=", pkField.reference(), undefined],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <InlineValuePicker
        filter={testFilter}
        field={pkField}
        handleChange={changeSpy}
      />,
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
      ["=", pkField.reference(), 777, 888],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <InlineValuePicker
        filter={testFilter}
        field={pkField}
        handleChange={changeSpy}
      />,
    );

    // click remove on the first data item, which is 777
    const [firstDataItem] = screen.getAllByLabelText("close icon");
    userEvent.click(firstDataItem);
    expect(changeSpy).toHaveBeenCalled();
    expect(changeSpy.mock.calls[0][0].arguments()).toEqual([888]);
  });

  it("tokenizes inputs for multi-input operators", async () => {
    let testFilter = new Filter(["=", textField.reference()], null, query);
    const changeSpy = jest.fn(newFilter => (testFilter = newFilter));

    renderWithProviders(
      <InlineValuePicker
        filter={testFilter}
        field={textField}
        handleChange={changeSpy}
      />,
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
      ["contains", textField.reference()],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <InlineValuePicker
        filter={testFilter}
        field={textField}
        handleChange={changeSpy}
      />,
    );

    const textInput = screen.getByPlaceholderText("Enter some text");
    userEvent.type(textInput, "foo,bar,");

    const lastCall = changeSpy.mock.calls[changeSpy.mock.calls.length - 1][0];
    // reads commas as part of the input instead of token separators
    expect(lastCall[2]).toEqual("foo,bar,");
  });

  it("shows multiple inputs for between filters", async () => {
    const testFilter = new Filter(
      ["between", pkField.reference(), 14, 74],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <InlineValuePicker
        filter={testFilter}
        field={pkField}
        handleChange={changeSpy}
      />,
    );

    expect(screen.getByPlaceholderText("Min")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Max")).toBeInTheDocument();
  });

  const noValueOperators = ["is-null", "not-null", "is-empty", "not-empty"];

  noValueOperators.forEach(operator => {
    it(`hides value input for ${operator} empty operator`, () => {
      const testFilter = new Filter(
        [operator, textField.reference(), null],
        null,
        query,
      );
      const changeSpy = jest.fn();

      renderWithProviders(
        <InlineValuePicker
          filter={testFilter}
          field={textField}
          handleChange={changeSpy}
        />,
      );

      expect(
        screen.queryByPlaceholderText("Enter some text"),
      ).not.toBeInTheDocument();
    });
  });
});
