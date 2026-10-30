import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type { Field } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import { detectPageviews } from "./pageviews";
import { readEventQuery } from "./read-event-query";

const STAGE = -1;

type SetupOpts = {
  fields: Field[];
};

const setup = ({ fields }: SetupOpts) => {
  const table = createMockTable({ id: 10, fields });
  const database = createMockDatabase({ tables: [table] });
  const metadataProvider = createMetadataProvider({
    databaseId: database.id,
    metadata: createMockMetadata({ databases: [database] }),
  });
  return { table, metadataProvider };
};

const EVENT_NAME = createMockField({
  id: 1,
  table_id: 10,
  name: "event_name",
  display_name: "Event Name",
  base_type: "type/Text",
});

const getFilterNames = (query: Lib.Query | null) =>
  query === null
    ? []
    : Lib.filters(query, STAGE).map(
        (filter) => Lib.displayInfo(query, STAGE, filter).displayName,
      );

describe("detectPageviews", () => {
  it("finds Umami's pageviews by their event type", () => {
    const { table, metadataProvider } = setup({
      fields: [
        EVENT_NAME,
        createMockField({
          id: 2,
          table_id: 10,
          name: "event_type",
          display_name: "Event Type",
          base_type: "type/Integer",
        }),
      ],
    });

    const pageviews = detectPageviews(metadataProvider, table);

    expect(pageviews?.name).toBe("Pageview");
    const query =
      pageviews !== undefined
        ? readEventQuery(metadataProvider, pageviews)
        : null;
    expect(getFilterNames(query)).toEqual(["Event Type is equal to 1"]);
  });

  it("finds nothing in a table it doesn't recognize", () => {
    const { table, metadataProvider } = setup({ fields: [EVENT_NAME] });

    expect(detectPageviews(metadataProvider, table)).toBeUndefined();
  });

  it("ignores an event type column that isn't a number", () => {
    const { table, metadataProvider } = setup({
      fields: [
        createMockField({
          id: 2,
          table_id: 10,
          name: "event_type",
          base_type: "type/Text",
        }),
      ],
    });

    expect(detectPageviews(metadataProvider, table)).toBeUndefined();
  });

  it("finds nothing before the table loads", () => {
    const { metadataProvider } = setup({ fields: [] });

    expect(detectPageviews(metadataProvider, undefined)).toBeUndefined();
  });
});
