import { t } from "ttag";

import * as Urls from "metabase/utils/urls";
import { ClickActionsView } from "metabase/visualizations/components/ClickActions";
import type {
  ClickActionPopoverProps,
  Drill,
  RegularClickAction,
} from "metabase/visualizations/types/click-actions";

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
      url: () => Urls.automaticDashboard(question, applyDrill(drill)),
    },
    {
      name: "automatic-insights.compare",
      title: t`Compare to the rest`,
      section: "auto-popover",
      icon: "segment",
      buttonType: "horizontal",
      url: () => Urls.comparisonDashboard(question, applyDrill(drill)),
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
