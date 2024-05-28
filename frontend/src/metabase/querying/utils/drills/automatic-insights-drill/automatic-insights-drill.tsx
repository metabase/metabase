import { t } from "ttag";

import { ClickActionsView } from "metabase/visualizations/components/ClickActions";
import type {
  RegularClickAction,
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import {
  getAutomaticDashboardUrl,
  getComparisonDashboardUrl,
} from "metabase-lib/v1/urls";

export const automaticInsightsDrill: Drill = ({
  question,
  drill,
  applyDrill,
}) => {
  const actions: RegularClickAction[] = [
    {
      name: "automatic-insights.xray",
      title: t`X-ray`,
      section: "auto-popover",
      icon: "bolt",
      buttonType: "horizontal",
      url: () => getAutomaticDashboardUrl(question, applyDrill(drill)),
    },
    {
      name: "automatic-insights.compare",
      title: t`Compare to the rest`,
      section: "auto-popover",
      icon: "segment",
      buttonType: "horizontal",
      url: () => getComparisonDashboardUrl(question, applyDrill(drill)),
    },
  ];

  const DrillPopover = ({ onClose, onClick }: ClickActionPopoverProps) => {
    return (
      <ClickActionsView
        clickActions={actions}
        close={onClose}
        onClick={onClick}
      />
    );
  };

  return [
    {
      name: "automatic-insights",
      title: t`Automatic insights…`,
      section: "auto",
      icon: "bolt",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};
