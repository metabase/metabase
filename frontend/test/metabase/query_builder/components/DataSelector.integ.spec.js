import React from "react";
import { mount } from "enzyme";
import { getStore } from "metabase/store";
import normalReducers from "metabase/reducers-main";

import DataSelector, {
  TableTriggerContent,
} from "metabase/query_builder/components/DataSelector.jsx";

describe("DatabaseSchemaAndTableDataSelector", () => {
  it("should render", async () => {
    const store = getStore(normalReducers);
    const dataSelector = mount(
      <DataSelector
        store={store}
        steps={["DATABASE_SCHEMA", "TABLE"]}
        getTriggerElementContent={TableTriggerContent}
        databases={[
          {
            id: 1,
            name: "db-1",
            tables: [
              { name: "table-1", display_name: "table-1", schema: "schema-1" },
              { name: "table-2", display_name: "table-2", schema: "schema-2" },
            ],
          },
        ]}
        isInitiallyOpen={true}
      />,
    );

    // this await is because onChangeDatabase get scheduled for the next tick
    await new Promise(r => setTimeout(r));

    const dataSelectorInstance = dataSelector.instance().getWrappedInstance();
    let popoverContent = mount(dataSelectorInstance.renderActiveStep());
    const schemaNames = popoverContent.find("h4").map(e => e.text());
    expect(schemaNames).toEqual(["Schema-1", "Schema-2"]);
    popoverContent
      .find("a")
      .first()
      .simulate("click");
    popoverContent = mount(dataSelectorInstance.renderActiveStep());
    expect(popoverContent.find("h4").text()).toBe("table-1");
  });
});
