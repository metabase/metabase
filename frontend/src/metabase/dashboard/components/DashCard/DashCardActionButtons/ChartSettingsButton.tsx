import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { ChartSettingsWithState } from "metabase/visualizations/components/ChartSettings";

import type {
  Dashboard,
  DashboardOrderedCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import DashCardActionButton from "./DashCardActionButton";
import type Metadata from "metabase-lib/metadata/Metadata";

interface Props {
  series: Series;
  dashboard: Dashboard;
  dashcard?: DashboardOrderedCard;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  metadata: Metadata;
}

function ChartSettingsButton({
  series,
  dashboard,
  dashcard,
  onReplaceAllVisualizationSettings,
  metadata,
}: Props) {
  return (
    <ModalWithTrigger
      wide
      tall
      triggerElement={
        <DashCardActionButton
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
        metadata={metadata}
      />
    </ModalWithTrigger>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsButton;
