import { usePrevious } from "@mantine/hooks";
import cx from "classnames";
import { dissoc } from "icepick";
import { useEffect, useState } from "react";
import type { ConnectedProps } from "react-redux";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { dashboardApi } from "metabase/api";
import { invalidateTags } from "metabase/api/tags";
import ActionButton from "metabase/components/ActionButton";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { DashboardGridConnected } from "metabase/dashboard/components/DashboardGrid";
import { DashboardTabs } from "metabase/dashboard/components/DashboardTabs";
import { DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_ID } from "metabase/dashboard/constants";
import {
  DashboardData,
  type DashboardDataReturnedProps,
} from "metabase/dashboard/hoc/DashboardData";
import { getIsHeaderVisible, getTabs } from "metabase/dashboard/selectors";
import title from "metabase/hoc/Title";
import { connect, useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { ParametersList } from "metabase/parameters/components/ParametersList";
import { addUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { Dashboard, DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { FixedWidthContainer } from "../../components/Dashboard/DashboardComponents";
import { useDashboardUrlQuery } from "../../hooks/use-dashboard-url-query";
import { XrayIcon } from "../XrayIcon";

import S from "./AutomaticDashboardApp.module.css";
import { SuggestionsSidebar } from "./SuggestionsSidebar";

type AutomaticDashboardAppRouterProps = WithRouterProps<{ splat: string }>;

const getDashboardId = (
  _state: State,
  { params: { splat }, location: { hash } }: AutomaticDashboardAppRouterProps,
) => `/auto/dashboard/${splat}${hash.replace(/^#?/, "?")}`;

const mapStateToProps = (
  state: State,
  props: AutomaticDashboardAppRouterProps,
) => ({
  metadata: getMetadata(state),
  dashboardId: getDashboardId(state, props),
  isHeaderVisible: getIsHeaderVisible(state),
  tabs: getTabs(state),
});

const connector = connect(mapStateToProps);
type ReduxProps = ConnectedProps<typeof connector>;

type AutomaticDashboardAppInnerProps = ReduxProps &
  AutomaticDashboardAppRouterProps &
  DashboardDataReturnedProps;

const AutomaticDashboardAppInner = ({
  dashboard,
  parameters,
  parameterValues,
  setParameterValue,
  isHeaderVisible,
  tabs,
  selectedTabId,
  slowCards,
  navigateToNewCardFromDashboard,

  location,
  router,
}: AutomaticDashboardAppInnerProps) => {
  useDashboardUrlQuery(router, location);

  const dispatch = useDispatch();

  const saveDashboard = (newDashboard: Omit<Dashboard, "id">) =>
    dispatch(dashboardApi.endpoints.saveDashboard.initiate(newDashboard));
  const invalidateCollections = () => invalidateTags(null, ["collection"]);

  const [savedDashboardId, setSavedDashboardId] = useState<DashboardId | null>(
    null,
  );

  const prevPathName = usePrevious(location.pathname);

  useEffect(() => {
    if (prevPathName !== location.pathname) {
      // scroll to the top when the pathname changes
      window.scrollTo(0, 0);

      // clear savedDashboardId if changing to a different dashboard
      setSavedDashboardId(null);
    }
  }, [prevPathName, location.pathname]);

  const save = async () => {
    if (dashboard) {
      // remove the transient id before trying to save
      const { data: newDashboard } = await saveDashboard(
        dissoc(dashboard, "id"),
      );

      if (!newDashboard) {
        return;
      }
      dispatch(dashboardApi.util.invalidateTags(invalidateCollections()));
      dispatch(
        addUndo({
          message: (
            <div className={cx(CS.flex, CS.alignCenter)}>
              {t`Your dashboard was saved`}
              <Link
                className={cx(CS.link, CS.textBold, CS.ml1)}
                to={Urls.dashboard(newDashboard)}
              >
                {t`See it`}
              </Link>
            </div>
          ),
          icon: "dashboard",
        }),
      );
      setSavedDashboardId(newDashboard.id);
    }
  };

  // pull out "more" related items for displaying as a button at the bottom of the dashboard
  const more = dashboard && dashboard.more;
  const related = dashboard && dashboard.related;

  const hasSidebar = related && Object.keys(related).length > 0;

  return (
    <div
      className={cx(CS.relative, "AutomaticDashboard", {
        "AutomaticDashboard--withSidebar": hasSidebar,
      })}
    >
      <div className="" style={{ marginRight: hasSidebar ? 346 : undefined }}>
        {isHeaderVisible && (
          <div
            className={cx(CS.bgWhite, CS.borderBottom)}
            data-testid="automatic-dashboard-header"
          >
            <div className={CS.wrapper}>
              <FixedWidthContainer
                data-testid="fixed-width-dashboard-header"
                isFixedWidth={dashboard?.width === "fixed"}
              >
                <div className={cx(CS.flex, CS.alignCenter, CS.py2)}>
                  <XrayIcon />
                  <div>
                    <h2 className={cx(CS.textWrap, CS.mr2)}>
                      {dashboard && <TransientTitle dashboard={dashboard} />}
                    </h2>
                  </div>
                  {savedDashboardId != null ? (
                    <Button className={CS.mlAuto} disabled>{t`Saved`}</Button>
                  ) : (
                    <ActionButton
                      className={cx(CS.mlAuto, CS.textNoWrap)}
                      success
                      borderless
                      actionFn={save}
                    >
                      {t`Save this`}
                    </ActionButton>
                  )}
                </div>
                {dashboard && tabs.length > 1 && (
                  <div className={cx(CS.wrapper, CS.flex, CS.alignCenter)}>
                    <DashboardTabs dashboardId={dashboard.id} />
                  </div>
                )}
              </FixedWidthContainer>
            </div>
          </div>
        )}

        <div className={cx(CS.wrapper, CS.pb4)}>
          {parameters && parameters.length > 0 && (
            <div className={cx(CS.px1, CS.pt1)}>
              <FixedWidthContainer
                id={DASHBOARD_PARAMETERS_PDF_EXPORT_NODE_ID}
                data-testid="fixed-width-filters"
                isFixedWidth={dashboard?.width === "fixed"}
              >
                <ParametersList
                  className={CS.mt1}
                  parameters={getValuePopulatedParameters({
                    parameters,
                    values: parameterValues,
                  })}
                  setParameterValue={setParameterValue}
                />
              </FixedWidthContainer>
            </div>
          )}
          <LoadingAndErrorWrapper
            className={cx(DashboardS.Dashboard, CS.p1, CS.flexFull)}
            loading={!dashboard}
            noBackground
          >
            {() =>
              dashboard && (
                <DashboardGridConnected
                  isXray
                  dashboard={dashboard}
                  selectedTabId={selectedTabId}
                  slowCards={slowCards}
                  clickBehaviorSidebarDashcard={null}
                  downloadsEnabled={false}
                  autoScrollToDashcardId={undefined}
                  reportAutoScrolledToDashcard={_.noop}
                  navigateToNewCardFromDashboard={
                    navigateToNewCardFromDashboard ?? undefined
                  }
                />
              )
            }
          </LoadingAndErrorWrapper>
        </div>
        {more && (
          <div className={cx(CS.flex, CS.justifyEnd, CS.px4, CS.pb4)}>
            <Link to={more} className={CS.ml2}>
              <Button iconRight="chevronright">{t`Show more about this`}</Button>
            </Link>
          </div>
        )}
      </div>
      {hasSidebar && (
        <Box
          className={cx(
            CS.absolute,
            CS.top,
            CS.right,
            CS.bottom,
            S.SuggestionsSidebarWrapper,
          )}
        >
          <SuggestionsSidebar related={related} />
        </Box>
      )}
    </div>
  );
};

export const AutomaticDashboardAppConnected = _.compose(
  connector,
  DashboardData,
  title(
    ({ dashboard }: { dashboard: Dashboard }) => dashboard && dashboard.name,
  ),
)(AutomaticDashboardAppInner);

const TransientTitle = ({ dashboard }: { dashboard: Dashboard }) =>
  dashboard.transient_name ? (
    <span>{dashboard.transient_name}</span>
  ) : dashboard.name ? (
    <span>{dashboard.name}</span>
  ) : null;
