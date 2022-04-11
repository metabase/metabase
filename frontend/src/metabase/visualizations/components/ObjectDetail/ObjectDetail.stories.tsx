import React from "react";
import { ComponentStory } from "@storybook/react";
import { ObjectDetailFn as ObjectDetail } from "./ObjectDetail";
import testDataset from "./testDataset";

export default {
  title: "Components/ObjectDetail",
  component: ObjectDetail,
  argTypes: { onChange: { action: "onChange" } },
};

const Template: ComponentStory<typeof ObjectDetail> = args => {
  return <ObjectDetail {...args} />;
};

Template.args = {
  data: testDataset,
  question: {
    displayName: () => "Product",
  },
  table: {
    objectName: () => "Product",
  },
  zoomedRow: testDataset.rows[0],
  zoomedRowID: 0,
  tableForeignKeys: [],
  tableForeignKeyReferences: [],
  settings: {},
  canZoomPreviousRow: false,
  canZoomNextRow: false,
  onVisualizationClick: () => null,
  visualizationIsClickable: () => false,
  fetchTableFks: () => null,
  loadObjectDetailFKReferences: () => null,
  viewPreviousObjectDetail: () => null,
  viewNextObjectDetail: () => null,
};
