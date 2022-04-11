import React from "react";
import { render, screen } from "@testing-library/react";

import { ObjectDetailFn as ObjectDetail } from "./ObjectDetail";
import testDataset from "./testDataset";

describe("Object Detail", () => {
  it("renders an object detail component", () => {
    render(
      <ObjectDetail
        data={testDataset}
        question={{
          displayName: () => "Product",
        }}
        table={{
          objectName: () => "Product",
        }}
        zoomedRow={testDataset.rows[0]}
        zoomedRowID={0}
        tableForeignKeys={[]}
        tableForeignKeyReferences={[]}
        settings={{
          column: () => null,
        }}
        canZoomPreviousRow={false}
        canZoomNextRow={false}
        onVisualizationClick={() => null}
        visualizationIsClickable={() => false}
        fetchTableFks={() => null}
        loadObjectDetailFKReferences={() => null}
        viewPreviousObjectDetail={() => null}
        viewNextObjectDetail={() => null}
      />,
    );

    screen.getAllByText("Product");
    screen.getByText(testDataset.rows[0][2].toString());
    screen.getByText(testDataset.rows[0][3].toString());
    screen.getByText(testDataset.rows[0][4].toString());
  });
});
