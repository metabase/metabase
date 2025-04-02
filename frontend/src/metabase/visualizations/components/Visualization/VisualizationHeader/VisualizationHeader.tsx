import type { ReactNode } from "react";

import DashboardS from "metabase/css/dashboard.module.css";
import type { CardSlownessStatus } from "metabase/dashboard/components/DashCard/types";
import type { IconProps } from "metabase/ui";
import { Box } from "metabase/ui";
import ChartCaption from "metabase/visualizations/components/ChartCaption";
import type { VisualizationDefinition } from "metabase/visualizations/types";
import type {
  Card,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import {
  VisualizationActionButtonsContainer,
  VisualizationSlowSpinner,
} from "../Visualization.styled";

interface VisualizationHeaderProps {
  series: Series | null;
  settings: VisualizationSettings;
  headerIcon?: IconProps | null;
  actionButtons?: ReactNode | null;
  isSlow?: CardSlownessStatus;
  loading: boolean;
  visualization?: VisualizationDefinition | null;
  replacementContent?: JSX.Element | null;
  dashcard?: DashboardCard;
  isMobile?: boolean;
  isAction?: boolean;
  isDashboard?: boolean;
  isEditing?: boolean;
  width?: number;
  getHref?: () => string | undefined;
  onChangeCardAndRun?: ((opts: { nextCard: Card }) => void) | null;
  error?: ReactNode;
  noResults?: boolean;
}

export const VisualizationHeader = ({
  series,
  settings,
  headerIcon,
  actionButtons,
  isSlow,
  loading,
  visualization,
  replacementContent,
  dashcard,
  isMobile,
  isAction,
  isDashboard,
  isEditing,
  width,
  getHref,
  onChangeCardAndRun,
  error,
  noResults,
}: VisualizationHeaderProps) => {
  // Only create action buttons content if we have action buttons to show
  const actionButtonsContent = actionButtons && (
    <VisualizationActionButtonsContainer>
      {isSlow && !loading && (
        <VisualizationSlowSpinner
          className={DashboardS.VisualizationSlowSpinner}
          size={18}
          isUsuallySlow={isSlow === "usually-slow"}
        />
      )}
      {actionButtons}
    </VisualizationActionButtonsContainer>
  );

  const title = settings["card.title"];
  const hasHeaderContent = title || actionButtonsContent;
  const isHeaderEnabled = !(visualization && visualization.noHeader);

  const hasHeader =
    (hasHeaderContent && (loading || error || noResults || isHeaderEnabled)) ||
    (replacementContent && (dashcard?.size_y !== 1 || isMobile) && !isAction);

  if (!hasHeader) {
    return null;
  }

  return (
    <Box p="0.5rem" style={{ flexShrink: 0 }}>
      <ChartCaption
        series={series}
        settings={settings}
        icon={headerIcon}
        actionButtons={actionButtonsContent}
        hasInfoTooltip={!isDashboard || !isEditing}
        width={width}
        getHref={getHref}
        onChangeCardAndRun={
          onChangeCardAndRun && !replacementContent ? onChangeCardAndRun : null
        }
      />
    </Box>
  );
};
