import React from "react";
import Visualization from "metabase/visualizations/components/Visualization";

export const component = Visualization;
export const noSnapshotTest = true;

export const description = `
A component to render a Metabase visualization
`;

const PROPS = {
  style: {
    width: 640,
    height: 480,
  },
};

const DATA = {
  rows: [["a", 1], ["b", 2], ["c", 3]],
  cols: [
    { name: "foo", display_name: "Foo", base_type: "type/Text" },
    { name: "bar", display_name: "Bar", base_type: "type/Number" },
  ],
};

export const examples = {
  Scalar: (
    <Visualization
      {...PROPS}
      rawSeries={[
        {
          card: { display: "scalar" },
          data: { rows: [[1]], cols: [{ name: "x" }] },
        },
      ]}
    />
  ),
  Table: (
    <Visualization
      {...PROPS}
      rawSeries={[
        {
          card: { display: "table" },
          data: DATA,
        },
      ]}
    />
  ),
  Bar: (
    <Visualization
      {...PROPS}
      rawSeries={[
        {
          card: { display: "bar" },
          data: DATA,
        },
      ]}
    />
  ),
};
