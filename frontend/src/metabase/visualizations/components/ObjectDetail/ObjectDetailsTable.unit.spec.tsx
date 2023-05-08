import React from "react";
import { render, screen } from "@testing-library/react";
import { DetailsTable } from "metabase/visualizations/components/ObjectDetail/ObjectDetailsTable";
import testDataset from "__support__/testDataset";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { TYPE } from "metabase-lib/types/constants";

const objectDetailCard = {
  card: {
    display: "object",
  },
  data: createMockDatasetData({
    cols: [
      createMockColumn({
        name: "details",
        display_name: "Details",
        base_type: TYPE.SerializedJSON,
        semantic_type: TYPE.SerializedJSON,
        effective_type: TYPE.SerializedJSON,
      }),
    ],
    rows: [[JSON.stringify({ hey: "yo" })]],
  }),
};

const invalidObjectDetailCard = {
  card: {
    display: "object",
  },
  data: createMockDatasetData({
    cols: [
      createMockColumn({
        name: "details",
        display_name: "Details",
        base_type: TYPE.SerializedJSON,
        semantic_type: TYPE.SerializedJSON,
        effective_type: TYPE.SerializedJSON,
      }),
    ],
    rows: [["i am not json"]],
  }),
};
describe("ObjectDetailsTable", () => {
  it("renders an object details table", () => {
    render(
      <DetailsTable
        data={testDataset as any}
        zoomedRow={testDataset.rows[1]}
        onVisualizationClick={() => null}
        visualizationIsClickable={() => false}
        settings={{
          column: () => null,
        }}
      />,
    );

    expect(screen.getByText("Small Marble Shoes")).toBeInTheDocument();
    expect(screen.getByText("Doohickey")).toBeInTheDocument();
  });

  describe("json field rendering", () => {
    it("should properly display JSON semantic type data as JSON", () => {
      render(
        <DetailsTable
          data={objectDetailCard.data}
          zoomedRow={objectDetailCard.data.rows[0]}
          onVisualizationClick={() => null}
          visualizationIsClickable={() => false}
          settings={{}}
        />,
      );

      expect(screen.getByText(/"hey"/i)).toBeInTheDocument();
      expect(screen.getByText(/"yo"/i)).toBeInTheDocument();
    });

    it("should not crash rendering invalid JSON", () => {
      render(
        <DetailsTable
          data={invalidObjectDetailCard.data}
          zoomedRow={invalidObjectDetailCard.data.rows[0]}
          onVisualizationClick={() => null}
          visualizationIsClickable={() => false}
          settings={{}}
        />,
      );

      expect(screen.getByText(/i am not json/i)).toBeInTheDocument();
    });
  });
});
