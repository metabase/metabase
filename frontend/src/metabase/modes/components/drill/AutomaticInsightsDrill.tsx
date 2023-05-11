import React from "react";
import { t } from "ttag";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { getGALabelForAction } from "metabase/visualizations/components/ChartClickActions/utils";
import Link from "metabase/core/components/Link/Link";
import MetabaseSettings from "metabase/lib/settings";
import type {
  ClickActionBase,
  ClickActionProps,
  PopoverClickAction,
} from "metabase/modes/types";
import {
  automaticDashboardDrillUrl,
  automaticInsightsDrill,
  compareToRestDrillUrl,
} from "metabase-lib/queries/drills/automatic-insights-drill";
import {
  ActionIcon,
  ClickActionButton,
} from "./common/DrillActionsListPopover.styled";
import DrillActionsListPopover from "./common/DrillActionsListPopover";

type AutoInsightsDrillOption = {
  title: string;
  icon: string;
  url: () => string;
};

const AutomaticInsightsDrill = ({
  question,
  clicked,
}: ClickActionProps): PopoverClickAction[] => {
  const enableXrays = MetabaseSettings.get("enable-xrays");

  if (!automaticInsightsDrill({ question, clicked, enableXrays })) {
    return [];
  }

  const drillOptions: AutoInsightsDrillOption[] = [
    {
      title: t`X-ray`,
      icon: "bolt",
      url: () => automaticDashboardDrillUrl({ question, clicked }),
    },
    {
      title: t`Compare to the rest`,
      icon: "segment",
      url: () => compareToRestDrillUrl({ question, clicked }),
    },
  ];

  const clickAction: ClickActionBase = {
    name: "automatic-insights",
    title: t`Automatic insights…`,
    section: "auto",
    icon: "bolt",
    buttonType: "horizontal",
  };

  const Component = () => {
    return (
      <DrillActionsListPopover title={t`Automatic insights…`}>
        {drillOptions.map(({ icon, title, url }) => (
          <ClickActionButton
            key={icon}
            as={Link}
            to={url()}
            icon={<ActionIcon name={icon} />}
            role="button"
            onClick={() =>
              MetabaseAnalytics.trackStructEvent(
                "Actions",
                "Executed Click Action",
                getGALabelForAction(clickAction),
              )
            }
          >
            {title}
          </ClickActionButton>
        ))}
      </DrillActionsListPopover>
    );
  };

  return [
    {
      ...clickAction,
      popover: Component,
    },
  ];
};

export default AutomaticInsightsDrill;
