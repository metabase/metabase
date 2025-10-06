import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { DashboardArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner/DashboardArchivedEntityBanner";
import ColorS from "metabase/css/core/colors.module.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { DashboardHeader } from "metabase/dashboard/components/DashboardHeader";
import { useDashboardContext } from "metabase/dashboard/context";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { FilterApplyToast } from "metabase/parameters/components/FilterApplyToast";
import ParametersS from "metabase/parameters/components/ParameterValueWidget.module.css";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex, Loader, Stack, Text } from "metabase/ui";
import type { DashboardCard } from "metabase-types/api";

import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "../../constants";
import {
  DashboardInfoButton,
  ExportAsPdfButton,
  FullscreenToggle,
  NightModeToggleButton,
} from "../DashboardHeader/buttons";
import { DashboardParameterPanel } from "../DashboardParameterPanel";
import { DashboardSidebars } from "../DashboardSidebars";
import { DashboardTabs } from "../DashboardTabs";
import { DashboardTitle } from "../DashboardTitle";
import { RefreshWidget } from "../RefreshWidget";

import S from "./Dashboard.module.css";
import { Grid, ParametersList } from "./components";

const DashboardDefaultView = ({ className }: { className?: string }) => {
  const {
    dashboard,
    isEditing,
    isFullscreen,
    isSharing,
    selectedTabId,
    shouldRenderAsNightMode,
  } = useDashboardContext();

  const currentTabDashcards = useMemo(() => {
    if (!dashboard || !Array.isArray(dashboard.dashcards)) {
      return [];
    }
    if (!selectedTabId) {
      return dashboard.dashcards;
    }
    return dashboard.dashcards.filter(
      (dc: DashboardCard) => dc.dashboard_tab_id === selectedTabId,
    );
  }, [dashboard, selectedTabId]);

  const tabHasCards = currentTabDashcards.length > 0;
  const dashboardHasCards = dashboard && dashboard.dashcards.length > 0;

  if (!dashboard) {
    return (
      <Stack justify="center" align="center" gap="sm" mt="xl">
        <Loader size="lg" />
        <Text c="text-light" size="xl">{t`Loading…`}</Text>
      </Stack>
    );
  }

  const isEmpty = !dashboardHasCards || (dashboardHasCards && !tabHasCards);

  // Embedding SDK has parent containers that requires dashboard to be full height to avoid double scrollbars.
  const isFullHeight = isEditing || isSharing || isEmbeddingSdk();

  return (
    <Flex
      className={cx(
        className,
        DashboardS.Dashboard,
        S.DashboardLoadingAndErrorWrapper,
        {
          [DashboardS.DashboardFullscreen]: isFullscreen,
          [DashboardS.DashboardNight]: shouldRenderAsNightMode,
          [ParametersS.DashboardNight]: shouldRenderAsNightMode,
          [ColorS.DashboardNight]: shouldRenderAsNightMode,
          [S.isFullHeight]: isFullHeight,
        },
      )}
      direction="column"
      mih="100%"
      w="100%"
      flex="1 0 auto"
      data-testid="dashboard"
    >
      {dashboard.archived && <DashboardArchivedEntityBanner />}

      <Box
        component="header"
        className={cx(
          S.DashboardHeaderContainer,
          EmbedFrameS.EmbedFrameHeader,
          {
            [S.isEmbeddingSdk]: isEmbeddingSdk(),
            [S.isFullscreen]: isFullscreen,
            [S.isNightMode]: shouldRenderAsNightMode,
          },
        )}
        data-element-id="dashboard-header-container"
        data-testid="dashboard-header-container"
      >
        <Dashboard.Header />
      </Box>

      <Flex
        pos="relative"
        miw={0}
        mih={0}
        className={cx(S.DashboardBody, {
          [S.isEditingOrSharing]: isEditing || isSharing,
        })}
      >
        <Box
          className={cx(S.ParametersAndCardsContainer, {
            [S.shouldMakeDashboardHeaderStickyAfterScrolling]:
              !isFullscreen && (isEditing || isSharing),
            [S.notEmpty]: !isEmpty,
          })}
          id={DASHBOARD_PDF_EXPORT_ROOT_ID}
          data-element-id="dashboard-parameters-and-cards"
          data-testid="dashboard-parameters-and-cards"
        >
          <DashboardParameterPanel />
          <FullWidthContainer
            className={S.CardsContainer}
            data-element-id="dashboard-cards-container"
          >
            <Dashboard.Grid />
          </FullWidthContainer>
        </Box>

        <DashboardSidebars />
      </Flex>

      <FilterApplyToast />
    </Flex>
  );
};

type DashboardComponentType = typeof DashboardDefaultView & {
  Header: typeof DashboardHeader;
  Grid: typeof Grid;
  Title: typeof DashboardTitle;
  Tabs: typeof DashboardTabs;
  ParametersList: typeof ParametersList;
  FullscreenButton: typeof FullscreenToggle;
  ExportAsPdfButton: typeof ExportAsPdfButton;
  InfoButton: typeof DashboardInfoButton;
  NightModeButton: typeof NightModeToggleButton;
  RefreshPeriod: typeof RefreshWidget;
};

const DashboardComponent = DashboardDefaultView as DashboardComponentType;
DashboardComponent.Header = DashboardHeader;
DashboardComponent.Grid = Grid;
DashboardComponent.Title = DashboardTitle;
DashboardComponent.Tabs = DashboardTabs;
DashboardComponent.ParametersList = ParametersList;
DashboardComponent.FullscreenButton = FullscreenToggle;
DashboardComponent.ExportAsPdfButton = ExportAsPdfButton;
DashboardComponent.InfoButton = DashboardInfoButton;
DashboardComponent.NightModeButton = NightModeToggleButton;
DashboardComponent.RefreshPeriod = RefreshWidget;

export const Dashboard = DashboardComponent;
