import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";

import _ from "underscore";

import { delay } from "metabase/lib/promise";

import {
  SAMPLE_DATASET,
  ANOTHER_DATABASE,
  MULTI_SCHEMA_DATABASE,
  metadata,
  makeMetadata,
  state as fixtureData,
} from "__support__/sample_dataset_fixture";

import { UnconnectedDataSelector as DataSelector } from "metabase/query_builder/components/DataSelector";

describe("DataSelector", () => {
  afterEach(cleanup);

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
    getByText("first_schema");
    getByText("second_schema");

    // but the databases are still displayed
    getByText("Multi-schema Database");
    getByText("Sample Dataset");
    getByText("Sample Empty Dataset");

    // clicking shows the table
    fireEvent.click(getByText("first_schema"));
    getByText("Table in First Schema");

    // db and schema are still visible
    getByText("Multi-schema Database");
    getByText(/first_schema/); // regex because there's a hyphen in the text too

    // but other schema is hidden
    expect(queryByText("second_schema")).toBe(null);

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
    getByText("first_schema");
    getByText("second_schema");
    fireEvent.click(getByText("second_schema"));

    // that triggers fetching tables
    await delay(1);
    expect(fetchSchemaTables).toHaveBeenCalled();

    // table is displayed
    rerenderWith({ databases, schemas, tables });
    getByText("Table in Second Schema");
  });

  it("should skip db and schema steps if there's only one option", async () => {
    const { getByText, queryByText } = render(
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

  it("should click into a single-schema db after expanding a multi-schema db", () => {
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

    fireEvent.click(getByText("Multi-schema Database"));
    getByText("first_schema");
    fireEvent.click(getByText("Sample Dataset"));
    getByText("Orders");
  });

  it("should expand multi-schema after clicking into single-schema", async () => {
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

    fireEvent.click(getByText("Sample Dataset"));
    await delay(1);
    // check that tables are listed
    getByText("Orders");
    // click header to return to db list
    fireEvent.click(getByText("Sample Dataset"));
    // click on a multi-schema db
    fireEvent.click(getByText("Multi-schema Database"));
    // see schema appear and click to view tables for good measure
    fireEvent.click(getByText("first_schema"));
    getByText("Table in First Schema");
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
