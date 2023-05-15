import React from "react";
import { render, screen } from "@testing-library/react";

import testDataset from "__support__/testDataset";
import { setupCardDataset } from "__support__/server-mocks";
import { createMockCard } from "metabase-types/api/mocks";
import Question from "metabase-lib/Question";

import {
  ObjectDetailView,
  ObjectDetailHeader,
  ObjectDetailBody,
  ObjectDetailWrapper,
} from "./ObjectDetail";
import type { ObjectDetailProps } from "./types";

function setup(options?: Partial<ObjectDetailProps>) {
  render(
    <ObjectDetailView
      data={testDataset as any}
      question={
        new Question(
          createMockCard({
            name: "Product",
          }),
        )
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
      {...options}
    />,
  );
}

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
    expect(screen.getByText(/Large Sandstone Socks/i)).toBeInTheDocument();
    expect(screen.getByText(/778/i)).toBeInTheDocument();
  });

  it("renders an object detail header with enabled next object button and disabled previous object button", () => {
    render(
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
    const nextDisabled = screen
      .getByTestId("view-next-object-detail")
      .getAttribute("disabled");

    const prevDisabled = screen
      .getByTestId("view-previous-object-detail")
      .getAttribute("disabled");

    expect(nextDisabled).toBeNull();
    expect(prevDisabled).not.toBeNull();
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

  it("renders an object detail component", () => {
    setup();

    expect(screen.getByText(/Product/i)).toBeInTheDocument();
    expect(
      screen.getByText(testDataset.rows[0][2].toString()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(testDataset.rows[0][3].toString()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(testDataset.rows[0][4].toString()),
    ).toBeInTheDocument();
  });

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

  it("fetches a missing row", async () => {
    setupCardDataset({
      data: {
        rows: [
          [
            "101",
            "1807963902339",
            "Extremely Hungry Toucan",
            "Gizmo",
            "Larson, Pfeffer and Klocko",
            31.78621880685793,
            4.3,
            "2017-01-09T09:51:20.352-07:00",
          ],
        ],
      },
    });

    // because this row is not in the test dataset, it should trigger a fetch
    setup({ zoomedRowID: "101", zoomedRow: undefined });

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(
      await screen.findByText(/Extremely Hungry Toucan/i),
    ).toBeInTheDocument();
  });

  it("shows not found if it can't find a missing row", async () => {
    setupCardDataset({ data: { rows: [] } });

    // because this row is not in the test dataset, it should trigger a fetch
    setup({ zoomedRowID: "102", zoomedRow: undefined });

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    expect(await screen.findByText(/we're a little lost/i)).toBeInTheDocument();
  });
});
