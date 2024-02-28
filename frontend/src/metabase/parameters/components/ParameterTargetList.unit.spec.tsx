import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import ParameterTargetList from "./ParameterTargetList";

const METADATA = createMockMetadata({
  databases: [createSampleDatabase()],
});

function setup() {
  const query = createQuery({ metadata: METADATA });
  const stageIndex = 0;

  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  const column = findColumn("ORDERS", "ID");

  const mappingOptions = [
    {
      section: "Order",
      sectionName: "Order",
      name: "ID",
      icon: "label",
      isForeign: false,
      query,
      stageIndex,
      column,
    },
  ];

  renderWithProviders(<ParameterTargetList mappingOptions={mappingOptions} />);
}

describe("ParameterTargetList", () => {
  test("should render the column info icon", () => {
    setup();
    expect(screen.getByLabelText("More info")).toBeInTheDocument();
  });
});
