import { isRejected } from "@reduxjs/toolkit";
import { useMount, usePrevious, useUnmount, useUpdateEffect } from "react-use";
import _ from "underscore";
import cx from "classnames";
import type { Location } from "history";
import { getMetadata } from "metabase/selectors/metadata";

import {
  getCardData,
  getDashboardComplete,
  getDraftParameterValues,
  getParameters,
  getParameterValues,
  getSelectedTabId,
  getSlowCards,
} from "metabase/dashboard/selectors";

import {
  cancelFetchDashboardCardData,
  fetchDashboard,
  fetchDashboardCardData,
  fetchDashboardCardMetadata,
  initialize as initializeDashboard,
  setParameterValue,
  setParameterValueToDefault,
} from "metabase/dashboard/actions";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  setEmbedDashboardEndpoints,
  setPublicDashboardEndpoints,
} from "metabase/services";
import { setErrorPage } from "metabase/redux/app";
import { isWithinIframe } from "metabase/lib/dom";
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import type {
  Dashboard,
  ParameterId,
  ParameterValue,
} from "metabase-types/api";
import EmbedFrame from "metabase/public/components/EmbedFrame/EmbedFrame";
import {
  DashboardContainer,
  DashboardGridContainer,
  StyledDashboardTabs,
} from "metabase/public/containers/PublicDashboard.styled";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import { checkNotNull } from "metabase/lib/types";

type DashboardIdOption = {
  uuid?: Dashboard["public_uuid"];
  token?: string;
};

const getDashboardId = (option: DashboardIdOption): string =>
  checkNotNull(option.token ?? option.uuid);

export const PublicDashboard = ({
  uuid,
  token,
  isFullscreen,
  isNightMode,
  location,
}: {
  uuid?: Dashboard["public_uuid"];
  token?: string;
  isFullscreen?: boolean;
  isNightMode?: boolean;
  location: Location;
}) => {
  const dispatch = useDispatch();

  const assetId = getDashboardId({ uuid, token });

  const {
    metadata,
    dashboard,
    dashcardData,
    slowCards,
    parameters,
    parameterValues,
    draftParameterValues,
    selectedTabId,
  } = useSelector(state => ({
    metadata: getMetadata(state),
    dashboard: getDashboardComplete(state) as Dashboard | undefined,
    dashcardData: getCardData(state),
    slowCards: getSlowCards(state),
    parameters: getParameters(state),
    parameterValues: getParameterValues(state),
    draftParameterValues: getDraftParameterValues(state),
    selectedTabId: getSelectedTabId(state),
  }));

  const initializeComponent = async () => {
    if (uuid) {
      setPublicDashboardEndpoints();
    } else if (token) {
      setEmbedDashboardEndpoints();
    }

    initializeDashboard();

    const result = await dispatch(
      fetchDashboard({
        dashId: assetId,
        queryParams: location.query,
      }),
    );

    if (isRejected(result)) {
      dispatch(setErrorPage(result.payload));
      return;
    }

    try {
      if (dashboard?.tabs?.length === 0) {
        dispatch(
          fetchDashboardCardData({
            isRefreshing: false,
            reload: false,
            clearCache: true,
          }),
        );
      }
    } catch (error) {
      console.error(error);
      dispatch(setErrorPage(error));
    }
  };

  useMount(initializeComponent);
  useUnmount(() => dispatch(cancelFetchDashboardCardData()));

  const prevProps = usePrevious({
    assetId,
    selectedTabId,
    parameterValues,
  });

  useUpdateEffect(() => {
    if (assetId !== prevProps?.assetId) {
      initializeComponent();
    } else if (!_.isEqual(prevProps?.selectedTabId, selectedTabId)) {
      dispatch(fetchDashboardCardData());
      dispatch(fetchDashboardCardMetadata());
    } else if (!_.isEqual(parameterValues, prevProps?.parameterValues)) {
      dispatch(fetchDashboardCardData({ reload: false, clearCache: true }));
    }
  }, [assetId, selectedTabId, parameterValues]);

  const getCurrentTabDashcards = () => {
    if (!dashboard || !Array.isArray(dashboard?.dashcards)) {
      return [];
    }
    if (!selectedTabId) {
      return dashboard.dashcards;
    }
    return dashboard.dashcards.filter(
      dashcard => dashcard.dashboard_tab_id === selectedTabId,
    );
  };

  const getHiddenParameterSlugs = () => {
    const currentTabParameterIds = getCurrentTabDashcards().flatMap(
      dashcard =>
        dashcard.parameter_mappings?.map(mapping => mapping.parameter_id) ?? [],
    );
    const hiddenParameters = parameters.filter(
      parameter => !currentTabParameterIds.includes(parameter.id),
    );
    return hiddenParameters.map(parameter => parameter.slug).join(",");
  };

  const buttons =
    !isWithinIframe() && dashboard
      ? getDashboardActions(
          {},
          {
            dashboard,
            isPublic: true,
          },
        )
      : [];

  return (
    <EmbedFrame
      location={location}
      name={dashboard && dashboard.name}
      description={dashboard && dashboard.description}
      dashboard={dashboard}
      parameters={parameters}
      parameterValues={parameterValues}
      draftParameterValues={draftParameterValues}
      hiddenParameterSlugs={getHiddenParameterSlugs()}
      setParameterValue={(parameterId: ParameterId, value: ParameterValue) =>
        dispatch(setParameterValue(parameterId, value))
      }
      setParameterValueToDefault={(id: ParameterId) =>
        dispatch(setParameterValueToDefault(id))
      }
      enableParameterRequiredBehavior
      actionButtons={
        buttons.length > 0 ? <div className="flex">{buttons}</div> : []
      }
      dashboardTabs={
        <StyledDashboardTabs dashboardId={assetId} location={location} />
      }
    >
      <LoadingAndErrorWrapper
        className={cx({
          "Dashboard--fullscreen": isFullscreen,
          "Dashboard--night": isNightMode,
        })}
        loading={!dashboard}
      >
        {() => (
          <DashboardContainer>
            <DashboardGridContainer>
              <DashboardGridConnected
                isPublic
                className="spread"
                mode={PublicMode}
                metadata={metadata}
                navigateToNewCardFromDashboard={() => {}}
                dashboard={dashboard}
                dashcardData={dashcardData}
                slowCards={slowCards}
                parameterValues={parameterValues}
              />
            </DashboardGridContainer>
          </DashboardContainer>
        )}
      </LoadingAndErrorWrapper>
    </EmbedFrame>
  );
};
