import React from "react";
import { render, screen } from "@testing-library/react";

import { ObjectDetail } from "metabase/visualizations/visualizations/ObjectDetail";
import { TYPE } from "metabase/lib/types";

const objectDetailCard = {
  card: {
    display: "object",
  },
  data: {
    cols: [
      {
        display_name: "Details",
        semantic_type: TYPE.SerializedJSON,
      },
    ],
    columns: ["details"],
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
        display_name: "Details",
        semantic_type: TYPE.SerializedJSON,
      },
    ],
    columns: ["details"],
    rows: [["i am not json"]],
  },
};

describe("ObjectDetail", () => {
  describe("json field rendering", () => {
    it("should properly display JSON semantic type data as JSON", () => {
      render(
        <ObjectDetail
          data={objectDetailCard.data}
          series={objectDetailCard}
          loadObjectDetailFKReferences={() => ({})}
          settings={{ column: () => ({}) }}
        />,
      );

      screen.getByText(/"hey"/i);
      screen.getByText(/"yo"/i);
    });

    it("should not crash rendering invalid JSON", () => {
      render(
        <ObjectDetail
          data={invalidObjectDetailCard.data}
          series={invalidObjectDetailCard}
          loadObjectDetailFKReferences={() => ({})}
          settings={{ column: () => ({}) }}
        />,
      );

      screen.getByText(/i am not json/i);
    });
  });
});
