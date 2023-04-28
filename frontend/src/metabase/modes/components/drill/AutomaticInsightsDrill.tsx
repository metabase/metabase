import React from "react";
import { t } from "ttag";
import { push } from "react-router-redux";
import type {
  ClickActionBase,
  DrillOptions,
  PopoverClickAction,
} from "metabase/modes/types";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { useDispatch } from "metabase/lib/redux";
import { getGALabelForAction } from "metabase/visualizations/components/ChartClickActions/utils";
import Link from "metabase/core/components/Link/Link";
import MetabaseSettings from "metabase/lib/settings";
import {
  compareToRestDrill,
  compareToRestDrillUrl,
} from "metabase-lib/queries/drills/compare-to-rest-drill";
import {
  automaticDashboardDrill,
  automaticDashboardDrillUrl,
} from "metabase-lib/queries/drills/automatic-dashboard-drill";
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
}: DrillOptions): PopoverClickAction[] => {
  const drillOptions: AutoInsightsDrillOption[] = [];

  const enableXrays = MetabaseSettings.get("enable-xrays");
  if (compareToRestDrill({ question, clicked, enableXrays })) {
    drillOptions.push({
      title: t`Compare to the rest`,
      icon: "segment",
      url: () => compareToRestDrillUrl({ question, clicked }),
    });
  }

  if (automaticDashboardDrill({ question, clicked, enableXrays })) {
    drillOptions.push({
      title: t`X-ray`,
      icon: "bolt",
      url: () => automaticDashboardDrillUrl({ question, clicked }),
    });
  }

  if (!drillOptions.length) {
    return [];
  }

  const clickAction: ClickActionBase = {
    name: "automatic-insights",
    title: t`Automatic insights…`,
    section: "auto",
    icon: "bolt",
    buttonType: "horizontal",
  };

  const Component = () => {
    const dispatch = useDispatch();

    if (drillOptions.length === 1) {
      const { url } = drillOptions[0];
      dispatch(push(url()));

      return <div />;
    }

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
