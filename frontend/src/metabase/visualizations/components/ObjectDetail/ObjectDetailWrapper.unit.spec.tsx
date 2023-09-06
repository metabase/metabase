import { render, screen } from "@testing-library/react";

import { testDataset } from "__support__/testDataset";

import { ObjectDetailWrapper } from "./ObjectDetailWrapper";

describe("ObjectDetailWrapper", () => {
  it("renders an object detail with a paginator", () => {
    render(
      <ObjectDetailWrapper
        data={testDataset as any}
        question={
          {
            displayName: () => "Product",
            database: () => ({
              getPlainObject: () => ({}),
            }),
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
        showHeader
        canZoom={true}
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

    expect(screen.getByText(/Item 1 of 10/i)).toBeInTheDocument();
  });

  it("shows object detail header", () => {
    render(
      <ObjectDetailWrapper
        data={testDataset as any}
        question={
          {
            displayName: () => "Product",
            database: () => ({
              getPlainObject: () => ({}),
            }),
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
          "detail.showHeader": true,
        }}
        canZoom={true}
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

    expect(screen.getByText(/Product/i)).toBeInTheDocument();
  });

  it("hides object detail header", () => {
    render(
      <ObjectDetailWrapper
        data={testDataset as any}
        question={
          {
            displayName: () => "Product",
            database: () => ({
              getPlainObject: () => ({}),
            }),
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
          "detail.showHeader": false,
        }}
        canZoom={true}
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

    expect(screen.queryByText(/Product/i)).not.toBeInTheDocument();
  });
});
