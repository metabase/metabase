import { screen } from "@testing-library/react";
import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/core/utils/types";
import { createMockField } from "metabase-types/api/mocks";
import {
  ORDERS,
  PEOPLE,
  PEOPLE_ID,
  PEOPLE_SOURCE_VALUES,
  REVIEWS,
  createOrdersTable,
  createPeopleIdField,
  createPeopleNameField,
  createPeopleSourceField,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";
import Filter from "metabase-lib/queries/structured/Filter";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { BulkFilterItem } from "./BulkFilterItem";

const BOOLEAN_FIELD_ID = 100;
const INTEGER_FIELD_ID = 101;

describe("BulkFilterItem", () => {
  const card = createSavedStructuredCard();

  const metadata = createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createOrdersTable(),
          createProductsTable(),
          createReviewsTable(),
          createPeopleTable({
            fields: [
              createPeopleIdField(),
              createPeopleNameField(),
              createPeopleSourceField({
                values: PEOPLE_SOURCE_VALUES.values,
              }),
              createMockField({
                id: INTEGER_FIELD_ID,
                table_id: PEOPLE_ID,
                name: "AGE",
                display_name: "Age",
                base_type: "type/Integer",
                effective_type: "type/Integer",
                has_field_values: "none",
              }),
              createMockField({
                id: BOOLEAN_FIELD_ID,
                table_id: PEOPLE_ID,
                name: "IS_ACTIVE",
                display_name: "Is Active",
                base_type: "type/Boolean",
                effective_type: "type/Boolean",
                has_field_values: "none",
              }),
            ],
          }),
        ],
      }),
    ],
    questions: [card],
  });

  const question = checkNotNull(metadata.question(card.id));
  const query = question.query() as StructuredQuery;

  const booleanField = checkNotNull(metadata.field(BOOLEAN_FIELD_ID));
  const floatField = checkNotNull(metadata.field(ORDERS.TOTAL));
  const intField = checkNotNull(metadata.field(INTEGER_FIELD_ID));
  const categoryField = checkNotNull(metadata.field(PEOPLE.SOURCE));
  const pkField = checkNotNull(metadata.field(ORDERS.ID));
  const fkField = checkNotNull(metadata.field(ORDERS.PRODUCT_ID));
  const textField = checkNotNull(metadata.field(PEOPLE.NAME));
  const longTextField = checkNotNull(metadata.field(REVIEWS.BODY));

  it("renders a boolean picker for a boolean filter", () => {
    const testFilter = new Filter(
      ["=", booleanField.reference(), true],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={booleanField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );

    expect(screen.getByLabelText("True")).toBeChecked();
    expect(screen.getByLabelText("False")).not.toBeChecked();
  });

  it("renders a value picker integer field type", () => {
    const testFilter = new Filter(["=", intField.reference(), 99], null, query);
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={intField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );

    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("renders a value picker for float field type", () => {
    const testFilter = new Filter(
      ["=", floatField.reference(), 99],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={floatField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("defaults to a between picker for float field type", () => {
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={undefined}
        dimension={floatField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
    expect(screen.getByText(/between/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Min")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Max")).toBeInTheDocument();
  });

  it("renders a category picker for category type", () => {
    const testFilter = new Filter(
      ["=", categoryField.reference(), "Gadget"],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={categoryField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.getByTestId("category-picker")).toBeInTheDocument();
  });

  it("renders a value picker for a primary key", () => {
    const testFilter = new Filter(["=", pkField.reference(), 1], null, query);
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={pkField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("renders a value picker for a foreign key", () => {
    const testFilter = new Filter(["=", fkField.reference(), 1], null, query);
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={fkField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
  });

  it("renders a value picker for a text field", () => {
    const testFilter = new Filter(
      ["contains", textField.reference(), "foo"],
      null,
      query,
    );
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={testFilter}
        dimension={textField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.getByTestId("value-picker")).toBeInTheDocument();
    expect(screen.getByDisplayValue("foo")).toBeInTheDocument();
  });

  it("defaults key filters to 'is' operator", () => {
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={undefined}
        dimension={fkField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.getByText(/is/i)).toBeInTheDocument();
  });

  it("defaults text filters to 'is' operator", () => {
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={undefined}
        dimension={textField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.getByText(/is/i)).toBeInTheDocument();
  });

  it("defaults long text filters to 'contains' operator", () => {
    const changeSpy = jest.fn();

    renderWithProviders(
      <BulkFilterItem
        query={query}
        filter={undefined}
        dimension={longTextField.dimension()}
        onAddFilter={changeSpy}
        onChangeFilter={changeSpy}
        onRemoveFilter={changeSpy}
      />,
    );
    expect(screen.getByText(/contains/i)).toBeInTheDocument();
  });
});
