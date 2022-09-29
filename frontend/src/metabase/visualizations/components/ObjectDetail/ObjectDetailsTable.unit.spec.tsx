import React from "react";
import { render, screen } from "@testing-library/react";

import { DetailsTable } from "metabase/visualizations/components/ObjectDetail/ObjectDetailsTable";
import { TYPE } from "metabase/lib/types";
import testDataset from "__support__/testDataset";

const objectDetailCard = {
  card: {
    display: "object",
  },
  data: {
    cols: [
      {
        name: "details",
        display_name: "Details",
        base_type: TYPE.SerializedJSON,
        semantic_type: TYPE.SerializedJSON,
        effective_type: TYPE.SerializedJSON,
      },
    ],
    rows: [[JSON.stringify({ hey: "yo" })]],
  },
};

const invalidObjectDetailCard = {
  card: {
    display: "object",
  },
  data: {
    cols: [
      {
        name: "details",
        display_name: "Details",
        base_type: TYPE.SerializedJSON,
        semantic_type: TYPE.SerializedJSON,
        effective_type: TYPE.SerializedJSON,
      },
    ],
    rows: [["i am not json"]],
  },
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

    screen.getByText("Small Marble Shoes");
    screen.getByText("Doohickey");
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

      screen.getByText(/"hey"/i);
      screen.getByText(/"yo"/i);
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

      screen.getByText(/i am not json/i);
    });
  });
});
