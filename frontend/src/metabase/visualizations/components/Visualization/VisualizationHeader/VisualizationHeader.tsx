import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import type { CardSlownessStatus } from "metabase/dashboard/components/DashCard/types";
import type { IconProps } from "metabase/ui";
import { Box, Flex } from "metabase/ui";
import ChartCaption from "metabase/visualizations/components/ChartCaption";
import type { VisualizationDefinition } from "metabase/visualizations/types";
import type {
  Card,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { VisualizationSlowSpinner } from "../Visualization.styled";

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
  const actionButtonsContent = actionButtons && (
    <Flex align="center">
      {isSlow && !loading && (
        <VisualizationSlowSpinner
          className={DashboardS.VisualizationSlowSpinner}
          size={18}
          isUsuallySlow={isSlow === "usually-slow"}
        />
      )}
      {actionButtons}
    </Flex>
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
    <Box p="sm" className={CS.flexNoShrink}>
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
