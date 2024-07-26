import { render, screen, fireEvent } from "@testing-library/react";

import { testDataset } from "__support__/testDataset";

import { ObjectDetailBody } from "./ObjectDetailBody";

describe("ObjectDetailBody", () => {
  it("renders an object detail body", () => {
    const handleClick = jest.fn();
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
        handleClick={handleClick}
      />,
    );

    expect(screen.getByText("Synergistic Granite Chair")).toBeInTheDocument();
    expect(screen.getByText("Doohickey")).toBeInTheDocument();
  });

  it("calls handleClick when clicking on a cell", () => {
    const handleClick = jest.fn();
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
        handleClick={handleClick}
      />,
    );

    const cellElement = screen.getByText("Synergistic Granite Chair");
    fireEvent.click(cellElement);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.any(HTMLElement),
    }));
  });

  it("does not call handleClick for 'View more' / 'View less' clicks", () => {
    const handleClick = jest.fn();
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
        handleClick={handleClick}
      />,
    );

    const viewMoreElement = screen.getByText("View more");
    fireEvent.click(viewMoreElement);

    expect(handleClick).not.toHaveBeenCalled();
  });
});
