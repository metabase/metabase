import React from "react";
import { ComponentStory, ComponentMeta } from "@storybook/react";
import { ObjectDetailFn as ObjectDetail } from "./ObjectDetail";
import testDataset from "__support__/testDataset";

export default {
  title: "Visualizations/ObjectDetail",
  component: ObjectDetail,
} as ComponentMeta<typeof ObjectDetail>;

export const Test: ComponentStory<typeof ObjectDetail> = () => (
  <ObjectDetail
    data={testDataset as any}
    question={
      {
        displayName: () => "Product",
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
    canZoomPreviousRow={false}
    canZoomNextRow={false}
    followForeignKey={() => null}
    onVisualizationClick={() => null}
    visualizationIsClickable={() => false}
    fetchTableFks={() => null}
    loadObjectDetailFKReferences={() => null}
    viewPreviousObjectDetail={() => null}
    viewNextObjectDetail={() => null}
  />
);

const Template: ComponentStory<typeof ObjectDetail> = args => {
  return <ObjectDetail {...args} />;
};

export const Primary = Template.bind({});
Primary.args = {
  data: testDataset as any,
  question: {
    displayName: () => "Product",
  } as any,
  table: {
    objectName: () => "Product",
  } as any,
  zoomedRow: testDataset.rows[1],
  zoomedRowID: 1,
  tableForeignKeys: [],
  tableForeignKeyReferences: [],
  settings: {
    column: () => null,
  },
  canZoomPreviousRow: false,
  canZoomNextRow: false,
  followForeignKey: () => null,
  onVisualizationClick: () => null,
  visualizationIsClickable: () => false,
  fetchTableFks: () => null,
  loadObjectDetailFKReferences: () => null,
  viewPreviousObjectDetail: () => null,
  viewNextObjectDetail: () => null,
};
