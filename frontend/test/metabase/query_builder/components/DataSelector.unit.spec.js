import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";

import { delay } from "metabase/lib/promise";

import {
  SAMPLE_DATASET,
  ANOTHER_DATABASE,
  MULTI_SCHEMA_DATABASE,
  metadata,
  makeMetadata,
} from "__support__/sample_dataset_fixture";

import { UnconnectedDataSelector as DataSelector } from "metabase/query_builder/components/DataSelector";

describe("DataSelector", () => {
  afterEach(cleanup);

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
    getByText("Multi-schema Dataset");
    getByText("Sample Dataset");
    getByText("Sample Empty Dataset");

    // clicking reveals schemas
    fireEvent.click(getByText("Multi-schema Dataset"));
    getByText("first_schema");
    getByText("second_schema");

    // but the databases are still displayed
    getByText("Multi-schema Dataset");
    getByText("Sample Dataset");
    getByText("Sample Empty Dataset");

    // clicking shows the table
    fireEvent.click(getByText("first_schema"));
    getByText("Table in First Schema");

    // db and schema are still visible
    getByText("Multi-schema Dataset");
    getByText(/first_schema/); // regex because there's a hyphen in the text too

    // but other schema is hidden
    expect(queryByText("second_schema")).toBe(null);

    // clicking on the table
    fireEvent.click(getByText("Table in First Schema"));
    const [tableId] = setTable.mock.calls[0];
    expect(tableId).toEqual(5);
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
        metadata={makeMetadata({
          databases: {},
          schemas: {},
          tables: {},
          fields: {},
          metrics: {},
          segments: {},
        })}
        databases={[]}
        fetchDatabases={fetchDatabases}
      />,
    );
    expect(fetchDatabases).not.toHaveBeenCalled();
    fireEvent.click(getByText("button"));
    await delay(1); // fetchDatabases hasn't been called until the next tick
    expect(fetchDatabases).toHaveBeenCalled();
  });
});
