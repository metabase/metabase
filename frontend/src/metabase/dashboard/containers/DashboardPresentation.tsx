// TODO: get text nodes working

import React, { useEffect, useRef, useState } from "react";
import { Icon, Box, Flex, Text } from "metabase/ui";
import { t } from "ttag";
import moment from "moment";
import { Link, withRouter } from "react-router";

import LogoIcon from "metabase/components/LogoIcon";
import { useDispatch, useSelector } from "metabase/lib/redux";

import * as Urls from "metabase/lib/urls";
import { Dashboard, DashboardTab } from "metabase-types/api";
import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { skipToken, useGetDashboardQuery } from "metabase/api";
import {
  getClickBehaviorSidebarDashcard,
  getIsNavigatingBackToDashboard,
  getParameterValues,
  getParameters,
  getSelectedTabId,
} from "metabase/dashboard/selectors";

import S from "./DashboardPresentation.module.css";
import {
  fetchDashboardCardData,
  initialize,
  selectTab,
  stopPresentation,
} from "../actions";
import { tinykeys } from "tinykeys";
import {
  DashboardGridConnected,
  DashboardGridKindaConnected,
} from "../components/DashboardGrid";
import { initializeData } from "metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboard";
import { usePrevious } from "react-use";
import _ from "underscore";
import { argv0 } from "process";

const SlideControls = ({
  slideNumber,
  slideCount,
  gotoNextSlide,
  gotoPrevSlide,
}: {
  slideNumber: number;
  slideCount: number;
  gotoNextSlide: () => void;
  gotoPrevSlide: () => void;
}) => {
  return (
    <Flex align="center" className={S.slideControls}>
      <Icon name="chevronleft" mx={2} onClick={gotoPrevSlide} />
      <Flex w="2.5rem" justify="center">
        <Text>
          {slideNumber} / {slideCount}
        </Text>
      </Flex>
      <Icon name="chevronright" onClick={gotoNextSlide} />
    </Flex>
  );
};

const PresentationControls = ({ dashboard }: { dashboard: Dashboard }) => (
  <Box className={S.presentationControls}>
    <Link to={Urls.dashboard(dashboard)}>
      <Icon name="close" />
    </Link>
  </Box>
);

export const Slide = ({
  dashboard,
  tab,
  width,
}: {
  dashboard: Dashboard;
  tab: DashboardTab;
  width?: number;
}) => {
  const DashGrid = width ? DashboardGridKindaConnected : DashboardGridConnected;

  return (
    <Box className={S.slide}>
      <Box className={S.slideInner}>
        <Box is="h2" style={{ fontWeight: 900, fontSize: "3rem" }} mb="md">
          {tab.name}
        </Box>
        <DashGrid
          clickBehaviorSidebarDashcard={null}
          isNightMode={false}
          isFullscreen
          isEditingParameter={false}
          isEditing={false}
          dashboard={dashboard}
          slowCards={{}}
          navigateToNewCardFromDashboard={() => {}}
          selectedTabId={tab.id}
          onEditingChange={() => {}}
          downloadsEnabled={false}
          autoScrollToDashcardId={undefined}
          reportAutoScrolledToDashcard={() => {}}
          width={width}
        />
      </Box>
    </Box>
  );
};

export const TitleSlide: React.FC<{ dashboard: Dashboard }> = ({
  dashboard,
}) => {
  const currentUser = useSelector(getCurrentUser);
  const presentationTime = moment().format("MM/DD/YYYY");

  return (
    <Box className={S.slide}>
      <Flex
        h="100%"
        direction="column"
        justify="space-between"
        className={S.slideInner}
      >
        <Box mb="lg">
          <LogoIcon height={56} />
        </Box>
        <Flex direction="column" gap="md">
          <Box style={{ fontWeight: 900, fontSize: "4rem" }}>
            {dashboard.name}
          </Box>
          <Box style={{ fontSize: "1.5rem" }}>{dashboard.description}</Box>
          <p className="text-body">
            {t`Presented by ${currentUser.common_name}`}
            <span className="mx1"> — </span>
            {presentationTime}
          </p>
        </Flex>
      </Flex>
    </Box>
  );
};

const PresentationInner = ({
  location,
  params,
}: {
  location: any;
  params: any;
}) => {
  const dashboardId = Urls.extractEntityId(params.slug);

  const {
    currentData: dashboard,
    isLoading,
    error,
    isUninitialized,
  } = useGetDashboardQuery(dashboardId ? { id: dashboardId } : skipToken);
  const dispatch = useDispatch();

  const {
    parameterValues,
    isNavigatingBackToDashboard,
    selectedTabId,
    clickBehaviorSidebarDashcard,
  } = useSelector(state => ({
    parameters: getParameters(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
    parameterValues: getParameterValues(state),
    selectedTabId: getSelectedTabId(state),
    clickBehaviorSidebarDashcard: getClickBehaviorSidebarDashcard(state),
  }));

  const tabCount = dashboard?.tabs?.length ?? 0;
  const tabs = dashboard?.tabs;

  const [slideIndex, setSlideIndex] = useState(0);

  const tab = tabs?.[slideIndex - 1];
  let tabIndex = tabs?.findIndex(t => t === tab) ?? -1;
  if (tabIndex < 0) tabIndex = 0;

  const closePrenstation = () => {
    if (dashboard?.id) {
      dispatch(stopPresentation(dashboard.id));
    }
  };

  const gotoPrevSlide = () => {
    const prevTabIndex = tabIndex - 1;
    if (tabs?.[prevTabIndex]) {
      const prevTab = tabs?.[prevTabIndex];
      dispatch(selectTab({ tabId: prevTab.id }));
      setSlideIndex(prevTabIndex + 1);
    } else {
      setSlideIndex(0);
    }
  };

  const gotoNextSlide = () => {
    const nextSlideIndex = slideIndex + 1;
    if (tabs?.[nextSlideIndex - 1]) {
      const nextTab = tabs?.[nextSlideIndex - 1];
      dispatch(selectTab({ tabId: nextTab.id }));
      setSlideIndex(nextSlideIndex);
    }
  };

  useEffect(() =>
    tinykeys(window, {
      Escape: closePrenstation,
      ArrowLeft: gotoPrevSlide,
      ArrowRight: gotoNextSlide,
    }),
  );
  const previousDashboardId = usePrevious(dashboard?.id);
  const previousSelectedTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);
  const shouldFetchCardData = dashboard?.tabs?.length === 0;

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      initializeData({
        dashboardId: String(dashboardId),
        shouldReload: !isNavigatingBackToDashboard,
        parameterQueryParams: {}, // TODO
        dispatch,
      });

      didMountRef.current = true;
      return;
    }

    if (dashboardId !== previousDashboardId) {
      // initializeData({
      //   dashboardId: String(dashboardId),
      //   shouldReload: true,
      //   parameterQueryParams: {},
      //   dispatch,
      // });
      return;
    }

    if (selectedTabId && selectedTabId !== previousSelectedTabId) {
      //  fetchDashboardCardData();
      return;
    }

    if (!_.isEqual(parameterValues, previousParameterValues)) {
      // fetchDashboardCardData({ reload: false, clearCache: true });
    }
  }, [
    dashboardId,
    // dispatch,
    // fetchDashboardCardData,
    // parameterQueryParams,
    // parameterValues,
    // previousDashboardId,
    // previousParameterValues,
    // previousSelectedTabId,
    selectedTabId,
    // shouldFetchCardData,
  ]);

  useEffect(() => {
    dispatch(fetchDashboardCardData());
  }, [slideIndex]);

  useEffect(
    function syncSlideWithUrl() {
      if (tab?.id) {
        window.location.hash = `slide=${tab.id}`;
      } else {
        window.history.replaceState(
          {},
          document.title,
          window.location.href.split("#")[0],
        );
      }
    },
    [tab?.id],
  );

  if (!dashboardId) {
    return <div>NO DASHBOARD ID</div>;
  }

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error... {JSON.stringify(error)}</div>;
  }

  if (!tab && slideIndex > 0) {
    return <div>EXPECTED A TAB</div>;
  }

  return (
    <Box className={S.presentation}>
      <PresentationControls dashboard={dashboard} />

      {slideIndex === 0 ? (
        <TitleSlide dashboard={dashboard} />
      ) : (
        <Slide
          dashboard={dashboard}
          tab={tab}
          clickBehaviorSidebarDashcard={clickBehaviorSidebarDashcard}
        />
      )}

      <SlideControls
        gotoNextSlide={gotoNextSlide}
        gotoPrevSlide={gotoPrevSlide}
        slideCount={tabCount + 1}
        slideNumber={slideIndex + 1}
      />
    </Box>
  );
};

export const DashboardPresentation = withRouter(PresentationInner);
