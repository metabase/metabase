import React from "react";
import { render, screen } from "@testing-library/react";

import {
  ObjectDetailFn as ObjectDetail,
  ObjectDetailHeader,
  ObjectDetailBody,
} from "./ObjectDetail";
import testDataset from "__support__/testDataset";

describe("Object Detail", () => {
  it("renders an object detail header", () => {
    render(
      <ObjectDetailHeader
        canZoom={false}
        objectName="Large Sandstone Socks"
        objectId={778}
        canZoomNextRow={false}
        canZoomPreviousRow={false}
        viewPreviousObjectDetail={() => null}
        viewNextObjectDetail={() => null}
        closeObjectDetail={() => null}
      />,
    );
    screen.getAllByText(/Large Sandstone Socks/i);
    screen.getByText(/778/i);
  });

  it("renders an object detail header with enable next object button and disabled previous object button", () => {
    const { container } = render(
      <ObjectDetailHeader
        canZoom={true}
        objectName="Large Sandstone Socks"
        objectId={778}
        canZoomNextRow={true}
        canZoomPreviousRow={false}
        viewPreviousObjectDetail={() => null}
        viewNextObjectDetail={() => null}
        closeObjectDetail={() => null}
      />,
    );
    const nextIsDisabled = container
      ?.querySelector(".Icon-chevrondown")
      ?.closest("button")?.disabled;

    const prevIsDisabled = container
      ?.querySelector(".Icon-chevronup")
      ?.closest("button")?.disabled;

    expect(prevIsDisabled).toBeTruthy();
    expect(nextIsDisabled).toBeFalsy();
  });

  it("renders an object detail body", () => {
    render(
      <ObjectDetailBody
        data={testDataset as any}
        objectName="Large Sandstone Socks"
        zoomedRow={testDataset.rows[2]}
        settings={{
          column: () => null,
        }}
        onVisualizationClick={() => null}
        visualizationIsClickable={() => false}
        tableForeignKeys={[]}
        tableForeignKeyReferences={{}}
        followForeignKey={() => null}
      />,
    );

    screen.getByText("Synergistic Granite Chair");
    screen.getByText("Doohickey");
  });

  it("renders an object detail component", () => {
    render(
      <ObjectDetail
        data={testDataset as any}
        question={
          {
            displayName: () => "Product",
          } as any
        }
        table={
          {
            objectName: () => "Product",
          } as any
        }
        zoomedRow={testDataset.rows[0]}
        zoomedRowID={0}
        tableForeignKeys={[]}
        tableForeignKeyReferences={[]}
        settings={{
          column: () => null,
        }}
        canZoomPreviousRow={false}
        canZoomNextRow={false}
        followForeignKey={() => null}
        onVisualizationClick={() => null}
        visualizationIsClickable={() => false}
        fetchTableFks={() => null}
        loadObjectDetailFKReferences={() => null}
        viewPreviousObjectDetail={() => null}
        viewNextObjectDetail={() => null}
        closeObjectDetail={() => null}
      />,
    );

    screen.getAllByText(/Product/i);
    screen.getByText(testDataset.rows[0][2].toString());
    screen.getByText(testDataset.rows[0][3].toString());
    screen.getByText(testDataset.rows[0][4].toString());
  });
});
