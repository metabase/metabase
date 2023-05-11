import React from "react";
import { t } from "ttag";
import type {
  ClickActionBase,
  ClickActionProps,
  PopoverClickAction,
} from "metabase/modes/types";
import { ClickActionPopoverProps } from "metabase/modes/types";
import MetabaseSettings from "metabase/lib/settings";
import { ChartClickActionsView } from "metabase/visualizations/components/ChartClickActions/ChartClickActionsView";
import {
  automaticDashboardDrillUrl,
  automaticInsightsDrill,
  compareToRestDrillUrl,
} from "metabase-lib/queries/drills/automatic-insights-drill";

const AutomaticInsightsDrill = ({
  question,
  clicked,
}: ClickActionProps): PopoverClickAction[] => {
  const enableXrays = MetabaseSettings.get("enable-xrays");

  if (!automaticInsightsDrill({ question, clicked, enableXrays })) {
    return [];
  }

  const baseClickAction: ClickActionBase = {
    name: "automatic-insights",
    title: t`Automatic insights…`,
    section: "auto",
    icon: "bolt",
    buttonType: "horizontal",
  };

  const drillOptions = [
    {
      ...baseClickAction,
      name: "exploratory-dashboard",
      title: t`X-ray`,
      section: "auto-popover",
      icon: "bolt",
      url: () => automaticDashboardDrillUrl({ question, clicked }),
    },
    {
      ...baseClickAction,
      name: "compare-dashboard",
      title: t`Compare to the rest`,
      section: "auto-popover",
      icon: "segment",
      url: () => compareToRestDrillUrl({ question, clicked }),
    },
  ];

  const Component = ({ onClick }: ClickActionPopoverProps) => {
    return (
      <ChartClickActionsView clickActions={drillOptions} onClick={onClick} />
    );
  };

  return [
    {
      ...baseClickAction,
      popover: Component,
    },
  ];
};

export default AutomaticInsightsDrill;
