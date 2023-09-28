import { render, screen } from "@testing-library/react";

import { setupCardDataset } from "__support__/server-mocks";
import { testDataset } from "__support__/testDataset";
import { createMockCard } from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/core/utils/types";
import Question from "metabase-lib/Question";

import { ObjectDetailView } from "./ObjectDetailView";
import type { ObjectDetailProps } from "./types";

function setup(options?: Partial<ObjectDetailProps>) {
  render(
    <ObjectDetailView
      data={testDataset}
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

describe("ObjectDetailView", () => {
  it("renders an object detail component", () => {
    setup();

    expect(screen.getByText(/Product/i)).toBeInTheDocument();
    expect(
      screen.getByText(checkNotNull(testDataset.rows[0][2]).toString()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(checkNotNull(testDataset.rows[0][3]).toString()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(checkNotNull(testDataset.rows[0][4]).toString()),
    ).toBeInTheDocument();
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
