import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { navigateToNewCardFromDashboard } from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/redux";
import { useLocation } from "metabase/router";
import { Box, Text } from "metabase/ui";

const AdhocDashboardAppInner = () => {
  const { dashboard, isHeaderVisible } = useDashboardContext();

  usePageTitle(dashboard?.name || "", { titleIndex: 1 });

  return (
    <Box className={CS.relative} data-testid="adhoc-dashboard">
      {isHeaderVisible && (
        <Box
          className={cx(CS.bgWhite, CS.borderBottom)}
          py="md"
          data-testid="adhoc-dashboard-header"
        >
          <Box className={CS.wrapper}>
            <Dashboard.Title className={cx(CS.textWrap, CS.h2)} />
            {dashboard?.description && (
              <Text c="text-secondary" mt="xs">
                {dashboard.description}
              </Text>
            )}
          </Box>
        </Box>
      )}
      <Box className={cx(CS.wrapper, CS.pb4)}>
        <Dashboard.Grid />
      </Box>
    </Box>
  );
};

export const AdhocDashboardApp = () => {
  const location = useLocation();
  const dispatch = useDispatch();

  const dashboardId = `/dashboard/adhoc${location.hash}`;

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
      <AdhocDashboardAppInner />
    </DashboardContextProvider>
  );
};
