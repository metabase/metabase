import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from "react";
import { connect, type ConnectedProps } from "react-redux";
import type { Route, WithRouterProps } from "react-router";
import _ from "underscore";

import { Error } from "metabase/core/components/Alert/Alert.stories";
import {
  getClickBehaviorSidebarDashcard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getDocumentTitle,
  getFavicon,
  getIsAdditionalInfoVisible,
  getIsAddParameterPopoverOpen,
  getIsDirty,
  getIsEditing,
  getIsEditingParameter,
  getIsHeaderVisible,
  getIsDashCardsLoadingComplete,
  getIsNavigatingBackToDashboard,
  getIsDashCardsRunning,
  getIsSharing,
  getLoadingStartTime,
  getParameterValues,
  getSelectedTabId,
  getSidebar,
  getSlowCards,
} from "metabase/dashboard/selectors";
import type {
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import { parseHashOptions } from "metabase/lib/browser";
import * as Urls from "metabase/lib/urls";
import { closeNavbar, setErrorPage } from "metabase/redux/app";
import { getIsNavbarOpen } from "metabase/selectors/app";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Loader } from "metabase/ui";
import type { DashboardCard, DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import * as dashboardActions from "../../actions";
import {
  DashboardEmptyState,
  DashboardEmptyStateWithoutAddPrompt,
} from "../Dashboard/DashboardEmptyState/DashboardEmptyState";
import { DashboardExportGridConnected } from "../DashboardExportGrid";

import {
  ExportContainer,
  type PrintPageMeta,
} from "./ExportContainer/ExportContainer";
import { ExportMenu } from "./ExportMenu/ExportMenu";
import type { ExportFormat, ExportOrientation } from "./ExportPDF.interfaces";

const FIRST_TAB = "1";

const mapStateToProps = (state: State) => {
  return {
    canManageSubscriptions: canManageSubscriptions(state),
    isAdmin: getUserIsAdmin(state),
    isNavbarOpen: getIsNavbarOpen(state),
    isEditing: getIsEditing(state),
    isSharing: getIsSharing(state),
    dashboardBeforeEditing: getDashboardBeforeEditing(state),
    isEditingParameter: getIsEditingParameter(state),
    isDirty: getIsDirty(state),
    dashboard: getDashboardComplete(state),
    slowCards: getSlowCards(state),
    parameterValues: getParameterValues(state),
    loadingStartTime: getLoadingStartTime(state),
    clickBehaviorSidebarDashcard: getClickBehaviorSidebarDashcard(state),
    isAddParameterPopoverOpen: getIsAddParameterPopoverOpen(state),
    sidebar: getSidebar(state),
    pageFavicon: getFavicon(state),
    documentTitle: getDocumentTitle(state),
    isRunning: getIsDashCardsRunning(state),
    isLoadingComplete: getIsDashCardsLoadingComplete(state),
    isHeaderVisible: getIsHeaderVisible(state),
    isAdditionalInfoVisible: getIsAdditionalInfoVisible(state),
    selectedTabId: getSelectedTabId(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
  };
};
const mapDispatchToProps = {
  ...dashboardActions,
  closeNavbar,
  setErrorPage,
};

type OwnProps = {
  dashboardId?: DashboardId;
  route: Route;
  params: { slug: string };
  children?: ReactNode;
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type ReduxProps = ConnectedProps<typeof connector>;
type DashboardAppProps = OwnProps & ReduxProps & WithRouterProps;

export function getDashboardId({ dashboardId, params }: DashboardAppProps) {
  if (dashboardId) {
    return dashboardId;
  }

  return Urls.extractEntityId(params.slug) as DashboardId;
}

const ExportPDFComponent: FC<DashboardAppProps> = props => {
  const {
    fetchDashboard,
    setErrorPage,
    addCardToDashboard,
    fetchDashboardCardData,
    dashboard,
    selectedTabId,
  } = props;
  const options = parseHashOptions(window.location.hash);
  const addCardOnLoad = options.add != null ? Number(options.add) : undefined;
  const isNightMode = false;

  const [exportFormat, setExportFormat] = useState<ExportFormat>("a4");
  const [exportOrientation, setExportOrientation] =
    useState<ExportOrientation>("p");
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pagesMetaById, setPagesMetaById] = useState<
    Record<string, PrintPageMeta> | undefined
  >();
  const dashboardId = getDashboardId(props);

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

  const handleChangeExportFormat = (format: ExportFormat) => {
    setExportFormat(format);
    setPagesMetaById(undefined);
  };
  const handleChangeExportOrientation = (orientation: ExportOrientation) => {
    setExportOrientation(orientation);
    setPagesMetaById(undefined);
  };

  const handleLoadDashboard = useCallback(
    async (dashboardId: DashboardId) => {
      const result = await fetchDashboard({
        dashId: dashboardId,
        queryParams: {},
        options: {
          clearCache: false,
        },
      });

      if (!isSuccessfulFetchDashboardResult(result)) {
        setErrorPage(result.payload);
        return;
      }

      try {
        const dashboard = result.payload.dashboard;
        if (addCardOnLoad != null) {
          addCardToDashboard({
            dashId: dashboardId,
            cardId: addCardOnLoad,
            tabId: dashboard.tabs?.[0]?.id ?? null,
          });
        }
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          setErrorPage({ ...error, context: "dashboard" });
        } else {
          console.error(error);
          setError(error);
        }
      }
    },
    [addCardOnLoad, addCardToDashboard, fetchDashboard, setErrorPage],
  );

  useEffect(() => {
    if (!isInitialized) {
      if (!dashboard) {
        handleLoadDashboard(dashboardId).then(() => setIsInitialized(true));
      }

      fetchDashboardCardData({
        reload: false,
        clearCache: true,
        loadAllCards: true,
      });
    }
  }, [
    dashboard,
    dashboardId,
    fetchDashboardCardData,
    handleLoadDashboard,
    isInitialized,
  ]);

  useEffect(() => {
    if (dashboard && !pagesMetaById) {
      const initialHiddenMeta = dashboard.dashcards.reduce<
        Record<string, string[]>
      >((acc, dashcard) => {
        if (dashcard.dashboard_tab_id === null) {
          return { ...acc, "1": [...(acc?.["1"] ?? []), String(dashcard.id)] };
        }
        return {
          ...acc,
          [dashcard.dashboard_tab_id]: [
            ...(acc?.[dashcard.dashboard_tab_id] ?? []),
            String(dashcard.id),
          ],
        };
      }, {});
      const normalizeHiddenMeta = Object.entries(initialHiddenMeta).reduce<
        Record<string, PrintPageMeta>
      >((acc, [key, value]) => ({ ...acc, [key]: [value] }), {});
      setPagesMetaById(normalizeHiddenMeta);
    }
  }, [dashboard, pagesMetaById]);

  if (error) {
    return <Error>Ошибка загрузки дашборда</Error>;
  }

  if (!isInitialized) {
    return (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader />
      </div>
    );
  }

  if (!dashboard || !pagesMetaById) {
    return null;
  }

  if (!dashboardHasCards) {
    return <DashboardEmptyStateWithoutAddPrompt isNightMode={isNightMode} />;
  }
  if (!dashboardHasCards) {
    return (
      <DashboardEmptyState
        dashboard={dashboard}
        isNightMode={isNightMode}
        addQuestion={() => undefined}
        closeNavbar={closeNavbar}
      />
    );
  }
  if (dashboardHasCards && !tabHasCards) {
    return <DashboardEmptyStateWithoutAddPrompt isNightMode={isNightMode} />;
  }

  const handlePagesMetaById =
    (tabId: number | string) => (hiddenMeta: PrintPageMeta) => {
      setPagesMetaById({ ...pagesMetaById, [tabId]: hiddenMeta });
    };
  if (!dashboard.tabs?.length) {
    return (
      <ExportMenu
        onChangeFormat={handleChangeExportFormat}
        onChangeOrientation={handleChangeExportOrientation}
        format={exportFormat}
        orientation={exportOrientation}
        dashboardName={dashboard.name}
      >
        {pagesMetaById[FIRST_TAB].map((ids, index) => {
          const cutDashboard = {
            ...dashboard,
            dashcards: dashboard.dashcards.filter(dashcard =>
              ids.includes(String(dashcard.id)),
            ),
          };
          return (
            <ExportContainer
              key={String(index)}
              title={dashboard.name}
              printPagesMeta={pagesMetaById[FIRST_TAB]}
              pageIndex={index}
              onChangePageLayout={handlePagesMetaById(FIRST_TAB)}
              format={exportFormat}
              orientation={exportOrientation}
            >
              <DashboardExportGridConnected
                key={dashboard.id}
                clickBehaviorSidebarDashcard={
                  props.clickBehaviorSidebarDashcard
                }
                isNightMode={isNightMode}
                isFullscreen={false}
                isEditingParameter={props.isEditingParameter}
                isEditing={props.isEditing}
                dashboard={cutDashboard}
                slowCards={props.slowCards}
                navigateToNewCardFromDashboard={
                  props.navigateToNewCardFromDashboard
                }
                selectedTabId={0}
              />
            </ExportContainer>
          );
        })}
      </ExportMenu>
    );
  }

  return (
    <ExportMenu
      onChangeFormat={handleChangeExportFormat}
      onChangeOrientation={handleChangeExportOrientation}
      format={exportFormat}
      orientation={exportOrientation}
      dashboardName={dashboard.name}
    >
      {[dashboard.tabs[selectedTabId - 1]].map(tab => {
        return pagesMetaById[tab.id].map((ids, index) => {
          const cutDashboard = {
            ...dashboard,
            dashcards: dashboard.dashcards.filter(dashcard =>
              ids.includes(String(dashcard.id)),
            ),
          };
          return (
            <ExportContainer
              key={`${tab.id}${ids}`}
              title={dashboard.name}
              printPagesMeta={pagesMetaById[tab.id]}
              pageIndex={index}
              onChangePageLayout={handlePagesMetaById(tab.id)}
              format={exportFormat}
              orientation={exportOrientation}
            >
              <DashboardExportGridConnected
                clickBehaviorSidebarDashcard={
                  props.clickBehaviorSidebarDashcard
                }
                isNightMode={isNightMode}
                isFullscreen={false}
                isEditingParameter={props.isEditingParameter}
                isEditing={props.isEditing}
                dashboard={cutDashboard}
                slowCards={props.slowCards}
                navigateToNewCardFromDashboard={
                  props.navigateToNewCardFromDashboard
                }
                selectedTabId={tab.id}
              />
            </ExportContainer>
          );
        });
      })}
    </ExportMenu>
  );
};

export const ExportPDF = _.compose(
  connector,
  title(
    ({
      dashboard,
      documentTitle,
    }: Pick<ReduxProps, "dashboard" | "documentTitle">) => ({
      title: documentTitle || dashboard?.name,
      titleIndex: 1,
    }),
  ),
  titleWithLoadingTime("loadingStartTime"),
)(ExportPDFComponent);

function isSuccessfulFetchDashboardResult(
  result: FetchDashboardResult,
): result is SuccessfulFetchDashboardResult {
  const hasError = "error" in result;
  return !hasError;
}
