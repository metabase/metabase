import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import type {
  ActionDashboardCard,
  Dashboard,
  DashboardCard,
  Series,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import { DashCardActionButton } from "../DashCardActionButton/DashCardActionButton";

interface Props {
  series: Series;
  dashboard: Dashboard;
  dashcard?: ActionDashboardCard | DashboardCard | VirtualDashboardCard;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
}

export function ChartSettingsButton({
  series,
  dashboard,
  dashcard,
  onReplaceAllVisualizationSettings,
}: Props) {
  return (
    <ModalWithTrigger
      wide
      tall
      triggerElement={
        <DashCardActionButton
          as="div"
          tooltip={t`Visualization options`}
          aria-label={t`Show visualization options`}
        >
          <DashCardActionButton.Icon name="palette" />
        </DashCardActionButton>
      }
      enableMouseEvents
    >
      <ChartSettingsWithState
        className="spread"
        series={series}
        onChange={onReplaceAllVisualizationSettings}
        isDashboard
        dashboard={dashboard}
        dashcard={dashcard}
      />
    </ModalWithTrigger>
  );
}
