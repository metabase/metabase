import { render, screen } from "@testing-library/react";

import { testDataset } from "__support__/testDataset";
import { DetailsTable } from "metabase/visualizations/components/ObjectDetail/ObjectDetailsTable";
import { TYPE } from "metabase-lib/v1/types/constants";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

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

const objectDetailImageCard = {
  card: {
    display: "object",
  },
  data: createMockDatasetData({
    cols: [
      createMockColumn({
        name: "id",
        display_name: "ID",
        base_type: TYPE.Integer,
        semantic_type: TYPE.PK,
        effective_type: TYPE.Integer,
      }),
      createMockColumn({
        name: "image",
        display_name: "Image",
        base_type: TYPE.String,
        semantic_type: TYPE.ImageURL,
        effective_type: TYPE.String,
      }),
      createMockColumn({
        name: "avatar_image",
        display_name: "Avatar Image",
        base_type: TYPE.String,
        semantic_type: TYPE.AvatarURL,
        effective_type: TYPE.String,
      }),
    ],
    rows: [
      [
        "1",
        "https://www.metabase.com/images/logo.svg",
        "https://www.metabase.com/images/home/cloud.svg",
      ],
      [
        "2",
        "https://www.metabase.com/images/logo.svg",
        "https://www.metabase.com/images/home/cloud.svg",
      ],
      [
        "3",
        "https://www.metabase.com/images/logo.svg",
        "https://www.metabase.com/images/home/cloud.svg",
      ],
    ],
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

  describe("image rendering", () => {
    it("should render an image if the column is an image url", () => {
      render(
        <DetailsTable
          data={objectDetailImageCard.data}
          zoomedRow={objectDetailImageCard.data.rows[1]}
          onVisualizationClick={() => null}
          visualizationIsClickable={() => false}
          settings={{
            column: () => null,
          }}
        />,
      );

      expect(
        screen.getByAltText(String(objectDetailImageCard.data.rows[1][1])),
      ).toBeInTheDocument();
    });

    it("should render an image if the column is an avatar image url", () => {
      render(
        <DetailsTable
          data={objectDetailImageCard.data}
          zoomedRow={objectDetailImageCard.data.rows[1]}
          onVisualizationClick={() => null}
          visualizationIsClickable={() => false}
          settings={{
            column: () => null,
          }}
        />,
      );

      expect(
        screen.getByAltText(String(objectDetailImageCard.data.rows[1][2])),
      ).toBeInTheDocument();
    });
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
