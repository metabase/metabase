import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { PLUGIN_NOTIFICATIONS_SDK } from "embedding-sdk-bundle/components/public/notifications";
import { DashboardArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner/DashboardArchivedEntityBanner";
import DashboardS from "metabase/css/dashboard.module.css";
import { DashboardHeader } from "metabase/dashboard/components/DashboardHeader";
import { useDashboardContext } from "metabase/dashboard/context";
import { getIsHeaderVisible } from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { useSelector } from "metabase/lib/redux";
import { FilterApplyToast } from "metabase/parameters/components/FilterApplyToast";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex, Loader } from "metabase/ui";
import type { DashboardCard } from "metabase-types/api";

import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "../../constants";
import {
  DashboardInfoButton,
  ExportAsPdfButton,
  FullscreenToggle,
} from "../DashboardHeader/buttons";
import { DashboardParameterPanel } from "../DashboardParameterPanel";
import { DashboardSidebars } from "../DashboardSidebars";
import { DashboardTabs } from "../DashboardTabs";
import { DashboardTitle } from "../DashboardTitle";
import { RefreshWidget } from "../RefreshWidget";

import S from "./Dashboard.module.css";
import { Grid, ParametersList } from "./components";

const DashboardDefaultView = ({ className }: { className?: string }) => {
  const { dashboard, isEditing, isFullscreen, isSharing, selectedTabId } =
    useDashboardContext();

  const isHeaderVisible = useSelector(getIsHeaderVisible);

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
    return <Loader size="lg" label={t`Loading…`} />;
  }

  const isEmpty = !dashboardHasCards || (dashboardHasCards && !tabHasCards);
  const hasTabs = dashboard.tabs && dashboard.tabs.length > 1;

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
            [S.noBorder]: !hasTabs && !isHeaderVisible,
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
          [S.isEmbeddingSdk]: isEmbeddingSdk(),
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
  SubscriptionsButton: typeof PLUGIN_NOTIFICATIONS_SDK.DashboardSubscriptionsButton;
  InfoButton: typeof DashboardInfoButton;
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
DashboardComponent.SubscriptionsButton =
  PLUGIN_NOTIFICATIONS_SDK.DashboardSubscriptionsButton;
DashboardComponent.InfoButton = DashboardInfoButton;
DashboardComponent.RefreshPeriod = RefreshWidget;

export const Dashboard = DashboardComponent;
