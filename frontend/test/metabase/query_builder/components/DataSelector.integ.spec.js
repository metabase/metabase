import React from "react";
import { delay } from "metabase/lib/promise";

import { mountWithStore } from "__support__/integration_tests";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector.jsx";

jest.mock("metabase/components/Popover.jsx");

describe("DatabaseSchemaAndTableDataSelector", () => {
  it("should render with one db that has multiple schemas", async () => {
    const { wrapper } = mountWithStore(
      <DatabaseSchemaAndTableDataSelector
        databases={[
          {
            id: 1,
            name: "db-1",
            tables: [
              { display_name: "table-1", schema: "schema-1" },
              { display_name: "table-2", schema: "schema-2" },
            ],
          },
        ]}
        isOpen={true}
      />,
    );

    // this await is because onChangeDatabase get scheduled for the next tick
    await delay(0);

    const schemaNames = wrapper.find("h4").map(e => e.text());
    expect(schemaNames).toEqual(["Schema-1", "Schema-2"]);

    wrapper
      .find("TestPopover")
      .find("a")
      .first()
      .simulate("click");

    expect(wrapper.find("h4").text()).toBe("table-1");
  });
});
