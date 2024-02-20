import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import type {
  Dashboard,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import type Question from "metabase-lib/Question";

import { DashCardActionButton } from "../DashCardActionButton/DashCardActionButton";

interface Props {
  series: Series;
  dashboard: Dashboard;
  dashcard?: DashboardCard;
  question?: Question;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
}

export function ChartSettingsButton({
  series,
  dashboard,
  dashcard,
  question,
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
        question={question}
      />
    </ModalWithTrigger>
  );
}
