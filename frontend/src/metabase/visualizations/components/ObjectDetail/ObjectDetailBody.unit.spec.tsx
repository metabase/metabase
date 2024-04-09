import { render, screen } from "@testing-library/react";

import { testDataset } from "__support__/testDataset";

import { ObjectDetailBody } from "./ObjectDetailBody";

describe("ObjectDetailBody", () => {
  it("renders an object detail body", () => {
    render(
      <ObjectDetailBody
        data={testDataset}
        objectName="Large Sandstone Socks"
        zoomedRow={testDataset.rows[2]}
        settings={{
          column: () => null,
        }}
        hasRelationships={false}
        onVisualizationClick={() => null}
        visualizationIsClickable={() => false}
        tableForeignKeys={[]}
        tableForeignKeyReferences={{}}
        followForeignKey={() => null}
      />,
    );

    expect(screen.getByText("Synergistic Granite Chair")).toBeInTheDocument();
    expect(screen.getByText("Doohickey")).toBeInTheDocument();
  });
});
