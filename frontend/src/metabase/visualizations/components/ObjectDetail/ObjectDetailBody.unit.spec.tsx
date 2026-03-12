import { testDataset } from "__support__/testDataset";
import { render, screen } from "__support__/ui";

import { ObjectDetailBody } from "./ObjectDetailBody";

describe("ObjectDetailBody", () => {
  it("renders an object detail body", () => {
    render(
      <ObjectDetailBody
        columns={testDataset.cols}
        zoomedRow={testDataset.rows[2]}
        settings={{
          column: () => null,
        }}
        onVisualizationClick={() => null}
        visualizationIsClickable={() => false}
      />,
    );

    expect(screen.getByText("Synergistic Granite Chair")).toBeInTheDocument();
    expect(screen.getByText("Doohickey")).toBeInTheDocument();
  });
});
