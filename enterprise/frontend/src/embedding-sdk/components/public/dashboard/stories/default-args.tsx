import { action } from "@storybook/addon-actions";

import { dashboardIds } from "embedding-sdk/test/storybook-id-args";

import type { SdkDashboardProps } from "../SdkDashboard";
export const MockDrillThroughQuestion = () => (
  <div>Custom Drill Through Question View</div>
);

const DASHBOARD_ID = (window as any).DASHBOARD_ID || dashboardIds.numberId;

export type DashboardStoryDefaultArgsProps = Partial<SdkDashboardProps>;
export const dashboardStoryDefaultArgs = ({
  dashboardId = DASHBOARD_ID,
  ...rest
}: DashboardStoryDefaultArgsProps = {}): SdkDashboardProps => ({
  mode: "editable",
  dashboardId,
  withTitle: true,
  withCardTitle: true,
  withDownloads: true,
  withFooter: true,
  withMetabot: true,
  initialParameters: { region: "west" },
  hiddenParameters: ["date"],
  drillThroughQuestionHeight: 500,
  useCustomDrillThrough: false, // New property to toggle custom drill-through
  renderDrillThroughQuestion: MockDrillThroughQuestion,
  onLoad: action("onLoad"),
  onLoadWithoutCards: action("onLoadWithoutCards"),
  plugins: {
    dashboard: {
      dashboardCardMenu: {
        withDownloads: true,
        withEditLink: true,
        withMetabot: true,
        customItems: [
          {
            label: "Custom Action",
            iconName: "add",
            onClick: () => action("Custom dashcard item clicked"),
          },
        ],
      },
    },
    mapQuestionClickActions: (clickActions, clickedDataPoint) => {
      // Example of adding a custom click action
      return [
        ...clickActions,
        {
          name: "Custom Click Action",
          action: () => action("Custom click action")(clickedDataPoint),
        },
      ];
    },
  },
  drillThroughQuestionProps: {
    title: true,
    height: 50,
    plugins: {
      dashboard: {
        dashboardCardMenu: {
          withDownloads: true,
          withEditLink: true,
          withMetabot: true,
          customItems: [
            {
              label: "Export as PDF",
              iconName: "document",
              onClick: () =>
                action("Custom dashcard item clicked")("Export as PDF clicked"),
            },
          ],
        },
      },
      mapQuestionClickActions: (clickActions, clickedDataPoint) => {
        // Example of adding a custom click action for drill-through questions
        return [
          ...clickActions,
          {
            name: "Analyze Further",
            action: () => action("Analyze Further clicked")(clickedDataPoint),
          },
        ];
      },
    },
  },
  ...rest,
});
