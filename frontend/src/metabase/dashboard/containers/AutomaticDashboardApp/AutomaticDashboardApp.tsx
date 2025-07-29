import cx from "classnames";
import { dissoc } from "icepick";
import { useEffect, useState } from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import { dashboardApi } from "metabase/api";
import { invalidateTags } from "metabase/api/tags";
import ActionButton from "metabase/common/components/ActionButton";
import Button from "metabase/common/components/Button";
import Link from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { navigateToNewCardFromDashboard } from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard";
import { DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID } from "metabase/dashboard/constants";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import { SetTitle } from "metabase/hoc/Title";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { addUndo } from "metabase/redux/undo";
import { Box } from "metabase/ui";
import type { DashboardId, Dashboard as IDashboard } from "metabase-types/api";

import { FixedWidthContainer } from "../../components/Dashboard/DashboardComponents";
import { useDashboardUrlQuery } from "../../hooks/use-dashboard-url-query";
import { XrayIcon } from "../XrayIcon";

import S from "./AutomaticDashboardApp.module.css";
import { SuggestionsSidebar } from "./SuggestionsSidebar";

const SIDEBAR_W = 346;

type AutomaticDashboardAppRouterProps = WithRouterProps<{ splat: string }>;

const AutomaticDashboardAppInner = () => {
  const { dashboard, parameters, isHeaderVisible, tabs } =
    useDashboardContext();

  const dispatch = useDispatch();

  const saveDashboard = (newDashboard: Omit<IDashboard, "id">) =>
    dispatch(dashboardApi.endpoints.saveDashboard.initiate(newDashboard));
  const invalidateCollections = () => invalidateTags(null, ["collection"]);

  const [savedDashboardId, setSavedDashboardId] = useState<DashboardId | null>(
    null,
  );

  useEffect(() => {
    if (dashboard?.id) {
      setSavedDashboardId(null);
    }
  }, [dashboard?.id]);

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
      {dashboard && <SetTitle title={dashboard.name} />}

      {isHeaderVisible && (
        <div
          className={cx(CS.bgWhite, CS.borderBottom)}
          data-testid="automatic-dashboard-header"
        >
          <div className={CS.wrapper}>
            <div className={cx(CS.pl1, { [CS.pr1]: !hasSidebar })}>
              <FixedWidthContainer
                isFixedWidth={dashboard?.width === "fixed" && !hasSidebar}
              >
                <div className={cx(CS.flex, CS.alignCenter, CS.py2)}>
                  <FixedWidthContainer
                    data-testid="fixed-width-dashboard-header"
                    className={cx(CS.flex, CS.alignCenter)}
                    isFixedWidth={dashboard?.width === "fixed"}
                  >
                    <XrayIcon />
                    <Dashboard.Title
                      className={cx(CS.textWrap, CS.mr2, CS.h2)}
                    />
                  </FixedWidthContainer>
                  <div
                    className={cx(CS.flex, CS.flexGrow1)}
                    style={{ maxWidth: SIDEBAR_W }}
                  >
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
                </div>
                {dashboard && tabs.length > 1 && (
                  <div className={cx(CS.wrapper, CS.flex, CS.alignCenter)}>
                    <Dashboard.Tabs />
                  </div>
                )}
              </FixedWidthContainer>
            </div>
          </div>
        </div>
      )}

      <div
        className={CS.relative}
        style={{ paddingRight: hasSidebar ? SIDEBAR_W : undefined }}
      >
        <div className={cx(CS.wrapper, CS.pb4)}>
          {parameters && parameters.length > 0 && (
            <div className={cx(CS.px1, CS.pt1)}>
              <FixedWidthContainer
                id={DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID}
                data-testid="fixed-width-filters"
                isFixedWidth={dashboard?.width === "fixed"}
              >
                <Dashboard.ParametersList />
              </FixedWidthContainer>
            </div>
          )}
          <Dashboard.Grid />
        </div>
        {more && (
          <div className={cx(CS.flex, CS.justifyEnd, CS.px4, CS.pb4)}>
            <Link to={more} className={CS.ml2}>
              <Button iconRight="chevronright">{t`Show more about this`}</Button>
            </Link>
          </div>
        )}

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
    </div>
  );
};

export const AutomaticDashboardApp = ({
  router,
  location,
  params,
}: AutomaticDashboardAppRouterProps) => {
  useDashboardUrlQuery(router, location);

  const dispatch = useDispatch();

  const dashboardId = `/auto/dashboard/${params.splat}${location.hash.replace(/^#?/, "?")}`;

  return (
    <DashboardContextProvider
      dashboardId={dashboardId}
      navigateToNewCardFromDashboard={(opts) =>
        dispatch(navigateToNewCardFromDashboard(opts))
      }
      downloadsEnabled={{ pdf: false, results: false }}
      dashcardMenu={null}
      dashboardActions={null}
    >
      <AutomaticDashboardAppInner />
    </DashboardContextProvider>
  );
};
