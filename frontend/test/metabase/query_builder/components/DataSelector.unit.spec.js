import React from "react";
import { render, fireEvent } from "@testing-library/react";
import xhrMock from "xhr-mock";

import _ from "underscore";

import { delay } from "metabase/lib/promise";

import {
  SAMPLE_DATASET,
  ANOTHER_DATABASE,
  MULTI_SCHEMA_DATABASE,
  OTHER_MULTI_SCHEMA_DATABASE,
  metadata,
  makeMetadata,
  state as fixtureData,
} from "__support__/sample_dataset_fixture";

import { UnconnectedDataSelector as DataSelector } from "metabase/query_builder/components/DataSelector";

describe("DataSelector", () => {
  beforeEach(() => {
    xhrMock.setup();
    xhrMock.get("/api/search?models=dataset&limit=1", {
      body: JSON.stringify({
        data: [],
        limit: 1,
        models: ["dataset"],
        offset: 0,
        total: 0,
      }),
    });
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  const emptyMetadata = {
    databases: {},
    schemas: {},
    tables: {},
    fields: {},
    metrics: {},
    segments: {},
  };

  it("should allow selecting db, schema, and table", () => {
    const setTable = jest.fn();
    const { getByText, queryByText } = render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATASET, ANOTHER_DATABASE]}
        metadata={metadata}
        isOpen={true}
        setSourceTableFn={setTable}
      />,
    );

    // displays dbs
    getByText("Multi-schema Database");
    getByText("Sample Dataset");
    getByText("Sample Empty Dataset");

    // clicking reveals schemas
    fireEvent.click(getByText("Multi-schema Database"));
    getByText("First Schema");
    getByText("Second Schema");

    // but the databases are still displayed
    getByText("Multi-schema Database");
    getByText("Sample Dataset");
    getByText("Sample Empty Dataset");

    // clicking shows the table
    fireEvent.click(getByText("First Schema"));
    getByText("Table in First Schema");

    // db and schema are still visible
    getByText("Multi-schema Database");
    getByText("- First Schema");

    // but other schema is hidden
    expect(queryByText("Second Schema")).toBe(null);

    // clicking on the table
    fireEvent.click(getByText("Table in First Schema"));
    const [tableId] = setTable.mock.calls[0];
    expect(tableId).toEqual(5);
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
      metadata: makeMetadata(emptyMetadata),
      isOpen: true,
      fetchDatabases,
      fetchSchemas,
      fetchSchemaTables,
    };
    const { databases, schemas, tables } = unconnectedFixtureData();

    const { rerender, getByText } = render(<DataSelector {...props} />);

    // we call rerenderWith to add more data after a fetch function was called
    const rerenderWith = data => {
      const metadata = makeMetadata({ ...emptyMetadata, ...data });
      rerender(
        <DataSelector
          {...props}
          metadata={metadata}
          databases={Object.values(metadata.databases)}
        />,
      );
    };

    // on initial load, we fetch databases
    await delay(1);
    expect(fetchDatabases).toHaveBeenCalled();
    getByText("Loading...");

    // select a db
    rerenderWith({ databases });
    getByText("Sample Dataset");
    getByText("Multi-schema Database");
    fireEvent.click(getByText("Multi-schema Database"));

    // that triggers fetching schemas
    await delay(1);
    expect(fetchSchemas).toHaveBeenCalled();

    // select a schema
    rerenderWith({ databases, schemas });
    getByText("First Schema");
    getByText("Second Schema");
    fireEvent.click(getByText("Second Schema"));

    // that triggers fetching tables
    await delay(1);
    expect(fetchSchemaTables).toHaveBeenCalled();

    // table is displayed
    rerenderWith({ databases, schemas, tables });
    getByText("Table in Second Schema");
  });

  it("should skip db and schema steps if there's only one option", async () => {
    const { getByText } = render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[SAMPLE_DATASET]}
        metadata={metadata}
        isOpen={true}
      />,
    );
    await delay(1); // state isn't updated until the next tick
    getByText("Orders");
  });

  it("shouldn't fetch databases until it's opened", async () => {
    const fetchDatabases = jest.fn();
    const { getByText } = render(
      <DataSelector
        steps={["DATABASE"]}
        triggerElement={<div>button</div>}
        metadata={makeMetadata(emptyMetadata)}
        databases={[]}
        fetchDatabases={fetchDatabases}
      />,
    );
    expect(fetchDatabases).not.toHaveBeenCalled();
    fireEvent.click(getByText("button"));
    await delay(1); // fetchDatabases hasn't been called until the next tick
    expect(fetchDatabases).toHaveBeenCalled();
  });

  it("should click into a single-schema db after expanding a multi-schema db", async () => {
    const { getByText } = render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATASET]}
        metadata={metadata}
        isOpen={true}
      />,
    );

    fireEvent.click(getByText("Multi-schema Database"));
    getByText("First Schema");
    fireEvent.click(getByText("Sample Dataset"));
    await delay(1);
    getByText("Orders");
  });

  it("should expand multi-schema after clicking into single-schema", async () => {
    const { getByText } = render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATASET]}
        metadata={metadata}
        isOpen={true}
      />,
    );

    fireEvent.click(getByText("Sample Dataset"));
    await delay(1);
    // check that tables are listed
    getByText("Orders");
    // click header to return to db list
    fireEvent.click(getByText("Sample Dataset"));
    // click on a multi-schema db
    fireEvent.click(getByText("Multi-schema Database"));
    // see schema appear and click to view tables for good measure
    fireEvent.click(getByText("First Schema"));
    await delay(1);
    getByText("Table in First Schema");
  });

  it("should expand schemas after viewing tables on a single-schema db", async () => {
    // This is the same and the previous test except that it first opens/closes
    // the multi-schema db. This left some lingering traces in component state
    // which caused a bug tha that the previous test didn't catch.
    const { getByText } = render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATASET]}
        metadata={metadata}
        isOpen={true}
      />,
    );

    // expand a multi-schema db to make sure it's schemas are loaded
    fireEvent.click(getByText("Multi-schema Database"));
    getByText("First Schema");
    getByText("Second Schema");

    // click into a single schema db, check for a table, and then return to db list
    fireEvent.click(getByText("Sample Dataset"));
    await delay(1);
    getByText("Orders");
    fireEvent.click(getByText("Sample Dataset"));

    // expand multi-schema db
    fireEvent.click(getByText("Multi-schema Database"));
    // see schema appear and click to view tables for good measure
    fireEvent.click(getByText("First Schema"));
    await delay(1);
    getByText("Table in First Schema");
  });

  it("should collapse expanded list of db's schemas", () => {
    const { getByText, queryByText } = render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        databases={[MULTI_SCHEMA_DATABASE, SAMPLE_DATASET]}
        metadata={metadata}
        isOpen={true}
      />,
    );

    getByText("Sample Dataset");
    fireEvent.click(getByText("Multi-schema Database"));
    // check that schemas are listed
    getByText("First Schema");
    getByText("Second Schema");
    // check for chevron icon
    expect(document.body.querySelector(".Icon-chevronup")).not.toBe(null);

    // collapse db
    fireEvent.click(getByText("Multi-schema Database"));
    // schemas are hidden, but databases are still shown
    expect(queryByText("First Schema")).toBe(null);
    expect(queryByText("Second Schema")).toBe(null);
    getByText("Sample Dataset");
    getByText("Multi-schema Database");
    // check for chevron icon
    expect(document.body.querySelector(".Icon-chevrondown")).not.toBe(null);
  });

  it("should auto-advance past db and schema in field picker", async () => {
    const { getByText } = render(
      <DataSelector
        steps={["SCHEMA", "TABLE", "FIELD"]}
        selectedDatabaseId={SAMPLE_DATASET.id}
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );
    await delay(1);

    getByText("Orders");
  });

  it("should select schema in field picker", () => {
    const { getByText } = render(
      <DataSelector
        steps={["SCHEMA", "TABLE", "FIELD"]}
        selectedDatabaseId={MULTI_SCHEMA_DATABASE.id}
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );

    fireEvent.click(getByText("First Schema"));
    getByText("Table in First Schema");
  });

  it("should open database picker with correct database selected", () => {
    const { getByText } = render(
      <DataSelector
        steps={["DATABASE"]}
        databases={[SAMPLE_DATASET, MULTI_SCHEMA_DATABASE]}
        selectedDatabaseId={SAMPLE_DATASET.id}
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );

    getByText("Sample Dataset", { selector: ".List-item--selected h4" });
  });

  it("should move between selected multi-schema dbs", () => {
    const { getByText } = render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        databases={[MULTI_SCHEMA_DATABASE, OTHER_MULTI_SCHEMA_DATABASE]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );

    fireEvent.click(getByText("Multi-schema Database"));
    getByText("First Schema");
    getByText("Second Schema");

    fireEvent.click(getByText("Other Multi-schema Database"));
    getByText("Other First Schema");
    getByText("Other Second Schema");
  });

  it("should skip schema when going to previous step", async () => {
    const { getByText } = render(
      <DataSelector
        steps={["DATABASE", "SCHEMA", "TABLE"]}
        databases={[SAMPLE_DATASET, ANOTHER_DATABASE]}
        combineDatabaseSchemaSteps
        triggerElement={<div />}
        metadata={metadata}
        isOpen={true}
      />,
    );

    // click into the first db
    fireEvent.click(getByText("Sample Dataset"));
    await delay(1);
    getByText("Orders");

    // click to go back
    fireEvent.click(getByText("Sample Dataset"));
    getByText("Sample Empty Dataset");

    // click back in
    fireEvent.click(getByText("Sample Dataset"));
    await delay(1);
    getByText("Orders");
  });
});

// removes associated ids from entities so we can load only some of them
function unconnectedFixtureData() {
  const { entities } = fixtureData;

  // removes "tables" from something like: {"1": {name:"foo", tables: [1,2,3]}}
  const stripKeysFromValues = (entity, keys) =>
    _.mapObject(entity, o => _.omit(o, keys));

  const databases = stripKeysFromValues(entities.databases, ["tables"]);
  const { schemas } = entities;
  const tables = stripKeysFromValues(entities.tables, [
    "fields",
    "metrics",
    "segments",
  ]);
  return { databases, schemas, tables };
}
