import React from "react";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { render, fireEvent, screen, getIcon } from "__support__/ui";

import { delay } from "metabase/lib/promise";

import { UnconnectedDataSelector as DataSelector } from "metabase/query_builder/components/DataSelector";

import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

const MULTI_SCHEMA_DB_ID = 2;
const MULTI_SCHEMA_TABLE1_ID = 100;
const MULTI_SCHEMA_TABLE2_ID = 101;

const OTHER_MULTI_SCHEMA_DB_ID = 3;
const OTHER_MULTI_SCHEMA_TABLE1_ID = 200;
const OTHER_MULTI_SCHEMA_TABLE2_ID = 201;

const EMPTY_DB_ID = 4;

describe("DataSelector", () => {
  beforeEach(() => {
    fetchMock.get(
      {
        url: "path:/api/search",
        query: { models: "dataset", limit: 1 },
      },
      {
        data: [],
        limit: 1,
        models: ["dataset"],
        offset: 0,
        total: 0,
      },
    );
  });

  const databases = [
    createSampleDatabase(),
    createMockDatabase({
      id: MULTI_SCHEMA_DB_ID,
      name: "Multi-schema Database",
      tables: [
        createMockTable({
          id: MULTI_SCHEMA_TABLE1_ID,
          db_id: MULTI_SCHEMA_DB_ID,
          schema: "first_schema",
          display_name: "Table in First Schema",
        }),
        createMockTable({
          id: MULTI_SCHEMA_TABLE2_ID,
          db_id: MULTI_SCHEMA_DB_ID,
          schema: "second_schema",
          display_name: "Table in Second Schema",
        }),
      ],
    }),
    createMockDatabase({
      id: OTHER_MULTI_SCHEMA_DB_ID,
      name: "Other Multi-schema Database",
      tables: [
        createMockTable({
          id: OTHER_MULTI_SCHEMA_TABLE1_ID,
          db_id: OTHER_MULTI_SCHEMA_DB_ID,
          schema: "other_first_schema",
        }),
        createMockTable({
          id: OTHER_MULTI_SCHEMA_TABLE2_ID,
          db_id: OTHER_MULTI_SCHEMA_DB_ID,
          schema: "other_second_schema",
        }),
      ],
    }),
    createMockDatabase({
      id: EMPTY_DB_ID,
      name: "Sample Empty Database",
      tables: [],
    }),
  ];

  const metadata = createMockMetadata({ databases });
  const emptyMetadata = createMockMetadata({});

  const SAMPLE_DATABASE = metadata.database(SAMPLE_DB_ID);
  const ANOTHER_DATABASE = metadata.database(EMPTY_DB_ID);
  const MULTI_SCHEMA_DATABASE = metadata.database(MULTI_SCHEMA_DB_ID);
  const OTHER_MULTI_SCHEMA_DATABASE = metadata.database(
    OTHER_MULTI_SCHEMA_DB_ID,
  );

  it("should allow selecting db, schema, and table", () => {
    const setTable = jest.fn();
    render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATABASE, ANOTHER_DATABASE]}
        metadata={metadata}
        isOpen={true}
        setSourceTableFn={setTable}
      />,
    );

    // displays dbs
    expect(screen.getByText("Multi-schema Database")).toBeInTheDocument();
    expect(screen.getByText("Sample Database")).toBeInTheDocument();
    expect(screen.getByText("Sample Empty Database")).toBeInTheDocument();

    // clicking reveals schemas
    fireEvent.click(screen.getByText("Multi-schema Database"));
    expect(screen.getByText("First Schema")).toBeInTheDocument();
    expect(screen.getByText("Second Schema")).toBeInTheDocument();

    // but the databases are still displayed
    expect(screen.getByText("Multi-schema Database")).toBeInTheDocument();
    expect(screen.getByText("Sample Database")).toBeInTheDocument();
    expect(screen.getByText("Sample Empty Database")).toBeInTheDocument();

    // clicking shows the table
    fireEvent.click(screen.getByText("First Schema"));
    expect(screen.getByText("Table in First Schema")).toBeInTheDocument();

    // db and schema are still visible
    expect(screen.getByText("Multi-schema Database")).toBeInTheDocument();
    expect(screen.getByText("- First Schema")).toBeInTheDocument();

    // but other schema is hidden
    expect(screen.queryByText("Second Schema")).not.toBeInTheDocument();

    // clicking on the table
    fireEvent.click(screen.getByText("Table in First Schema"));
    const [tableId] = setTable.mock.calls[0];
    expect(tableId).toEqual(MULTI_SCHEMA_TABLE1_ID);
  });

  it("should fetch db, schema, and table progressively", async () => {
    const fetchDatabases = jest.fn();
    const fetchSchemas = jest.fn();
    const fetchSchemaTables = jest.fn();

    const props = {
      steps: ["DATABASE", "SCHEMA", "TABLE"],
      combineDatabaseSchemaSteps: true,
      triggerElement: <div />,
      databases: [],
      metadata: emptyMetadata,
      isOpen: true,
      fetchDatabases,
      fetchSchemas,
      fetchSchemaTables,
    };

    const { rerender } = render(<DataSelector {...props} />);

    // we call rerenderWith to add more data after a fetch function was called
    const rerenderWith = nextMetadata => {
      rerender(
        <DataSelector
          {...props}
          metadata={nextMetadata}
          databases={Object.values(metadata.databases)}
        />,
      );
    };

    // on initial load, we fetch databases
    await delay(1);
    expect(fetchDatabases).toHaveBeenCalled();
    rerender(<DataSelector {...props} loading />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // select a db
    let nextMetadata = createMockMetadata({ databases });
    nextMetadata.schemas = {};
    nextMetadata.tables = {};
    nextMetadata.fields = {};
    rerenderWith(nextMetadata);

    expect(screen.getByText("Sample Database")).toBeInTheDocument();
    expect(screen.getByText("Multi-schema Database")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Multi-schema Database"));

    // that triggers fetching schemas
    await delay(1);
    expect(fetchSchemas).toHaveBeenCalled();

    // select a schema
    nextMetadata = createMockMetadata({ databases });
    nextMetadata.tables = {};
    nextMetadata.fields = {};
    rerenderWith(nextMetadata);
    expect(screen.getByText("First Schema")).toBeInTheDocument();
    expect(screen.getByText("Second Schema")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Second Schema"));

    // that triggers fetching tables
    await delay(1);
    expect(fetchSchemaTables).toHaveBeenCalled();

    // table is displayed
    rerenderWith(metadata);
    expect(screen.getByText("Table in Second Schema")).toBeInTheDocument();
  });

  it("should skip db and schema steps if there's only one option", async () => {
    render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[SAMPLE_DATABASE]}
        metadata={metadata}
        isOpen={true}
      />,
    );
    await delay(1); // state isn't updated until the next tick
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });

  it("shouldn't fetch databases until it's opened", async () => {
    const fetchDatabases = jest.fn();
    render(
      <DataSelector
        steps={["DATABASE"]}
        triggerElement={<div>button</div>}
        metadata={emptyMetadata}
        databases={[]}
        fetchDatabases={fetchDatabases}
      />,
    );
    expect(fetchDatabases).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("button"));
    await delay(1); // fetchDatabases hasn't been called until the next tick
    expect(fetchDatabases).toHaveBeenCalled();
  });

  it("should click into a single-schema db after expanding a multi-schema db", async () => {
    render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATABASE]}
        metadata={metadata}
        isOpen={true}
      />,
    );

    fireEvent.click(screen.getByText("Multi-schema Database"));
    expect(screen.getByText("First Schema")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sample Database"));
    await delay(1);
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });

  it("should expand multi-schema after clicking into single-schema", async () => {
    render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATABASE]}
        metadata={metadata}
        isOpen={true}
      />,
    );

    fireEvent.click(screen.getByText("Sample Database"));
    await delay(1);
    // check that tables are listed
    expect(screen.getByText("Orders")).toBeInTheDocument();
    // click header to return to db list
    fireEvent.click(screen.getByText("Sample Database"));
    // click on a multi-schema db
    fireEvent.click(screen.getByText("Multi-schema Database"));
    // see schema appear and click to view tables for good measure
    fireEvent.click(screen.getByText("First Schema"));
    await delay(1);
    expect(screen.getByText("Table in First Schema")).toBeInTheDocument();
  });

  it("should expand schemas after viewing tables on a single-schema db", async () => {
    // This is the same and the previous test except that it first opens/closes
    // the multi-schema db. This left some lingering traces in component state
    // which caused a bug tha that the previous test didn't catch.
    render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATABASE]}
        metadata={metadata}
        isOpen={true}
      />,
    );

    // expand a multi-schema db to make sure it's schemas are loaded
    fireEvent.click(screen.getByText("Multi-schema Database"));
    expect(screen.getByText("First Schema")).toBeInTheDocument();
    expect(screen.getByText("Second Schema")).toBeInTheDocument();

    // click into a single schema db, check for a table, and then return to db list
    fireEvent.click(screen.getByText("Sample Database"));
    await delay(1);
    expect(screen.getByText("Orders")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sample Database"));

    // expand multi-schema db
    fireEvent.click(screen.getByText("Multi-schema Database"));
    // see schema appear and click to view tables for good measure
    fireEvent.click(screen.getByText("First Schema"));
    await delay(1);
    expect(screen.getByText("Table in First Schema")).toBeInTheDocument();
  });

  it("should collapse expanded list of db's schemas", () => {
    render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATABASE]}
        metadata={metadata}
        isOpen={true}
      />,
    );

    expect(screen.getByText("Sample Database")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Multi-schema Database"));
    // check that schemas are listed
    expect(screen.getByText("First Schema")).toBeInTheDocument();
    expect(screen.getByText("Second Schema")).toBeInTheDocument();
    // check for chevron icon
    expect(getIcon("chevronup")).toBeInTheDocument();

    // collapse db
    fireEvent.click(screen.getByText("Multi-schema Database"));
    // schemas are hidden, but databases are still shown
    expect(screen.queryByText("First Schema")).not.toBeInTheDocument();
    expect(screen.queryByText("Second Schema")).not.toBeInTheDocument();
    expect(screen.getByText("Sample Database")).toBeInTheDocument();
    expect(screen.getByText("Multi-schema Database")).toBeInTheDocument();
    // check for chevron icon
    expect(getIcon("chevrondown")).toBeInTheDocument();
  });

  it("should auto-advance past db and schema in field picker", async () => {
    render(
      <DataSelector
        steps={["SCHEMA", "TABLE", "FIELD"]}
        selectedDatabaseId={SAMPLE_DATABASE.id}
        databases={[SAMPLE_DATABASE]}
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );
    await delay(1);

    expect(screen.getByText("Orders")).toBeInTheDocument();
  });

  it("should select schema in field picker", () => {
    render(
      <DataSelector
        steps={["SCHEMA", "TABLE", "FIELD"]}
        selectedDatabaseId={MULTI_SCHEMA_DATABASE.id}
        databases={[MULTI_SCHEMA_DATABASE]}
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );

    fireEvent.click(screen.getByText("First Schema"));
    expect(screen.getByText("Table in First Schema")).toBeInTheDocument();
  });

  it("should open database picker with correct database selected", () => {
    render(
      <DataSelector
        steps={["DATABASE"]}
        databases={[SAMPLE_DATABASE, MULTI_SCHEMA_DATABASE]}
        selectedDatabaseId={SAMPLE_DATABASE.id}
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );

    expect(
      screen.getByText("Sample Database", {
        selector: ".List-item--selected h4",
      }),
    ).toBeInTheDocument();
  });

  it("should move between selected multi-schema dbs", () => {
    render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        databases={[MULTI_SCHEMA_DATABASE, OTHER_MULTI_SCHEMA_DATABASE]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );

    fireEvent.click(screen.getByText("Multi-schema Database"));
    expect(screen.getByText("First Schema")).toBeInTheDocument();
    expect(screen.getByText("Second Schema")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Other Multi-schema Database"));
    expect(screen.getByText("Other First Schema")).toBeInTheDocument();
    expect(screen.getByText("Other Second Schema")).toBeInTheDocument();
  });

  it("should skip schema when going to previous step", async () => {
    render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        databases={[SAMPLE_DATABASE, ANOTHER_DATABASE]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );

    // click into the first db
    fireEvent.click(screen.getByText("Sample Database"));
    await delay(1);
    expect(screen.getByText("Orders")).toBeInTheDocument();

    // click to go back
    fireEvent.click(screen.getByText("Sample Database"));
    expect(screen.getByText("Sample Empty Database")).toBeInTheDocument();

    // click back in
    fireEvent.click(screen.getByText("Sample Database"));
    await delay(1);
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });

  it("shows an empty state without any databases", async () => {
    render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        databases={[]}
        triggerElement={<div />}
        isOpen={true}
      />,
    );

    expect(
      screen.getByText("To pick some data, you'll need to add some first"),
    ).toBeInTheDocument();
  });
});
