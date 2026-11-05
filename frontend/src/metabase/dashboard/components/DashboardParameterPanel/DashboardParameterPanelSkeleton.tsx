import cx from "classnames";

import {
  getIsLastSeenDashboardFixedWidth,
  getLastSeenDashboardHeaderParameters,
} from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { useSelector } from "metabase/redux";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Flex, Skeleton } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import DashboardS from "../Dashboard/Dashboard.module.css";
import { FixedWidthContainer } from "../Dashboard/DashboardComponents";

import S from "./DashboardParameterPanel.module.css";

/**
 * The dashboard's filter widgets as skeletons, shown while the dashboard
 * loads. They come from the dashboard as last seen in the in-memory Redux
 * cache, so nothing is drawn on a fresh page load.
 */
export const DashboardParameterPanelSkeleton = ({
  dashboardId,
  hideParameters,
}: {
  dashboardId: DashboardId | null;
  hideParameters?: string | null;
}) => {
  const isFixedWidth = useSelector((state) =>
    getIsLastSeenDashboardFixedWidth(state, dashboardId),
  );
  const headerParameters = useSelector((state) =>
    getLastSeenDashboardHeaderParameters(state, dashboardId),
  );
  const visibleParameters = getVisibleParameters(
    headerParameters,
    hideParameters,
  );

  if (visibleParameters.length === 0) {
    return null;
  }

  return (
    <FullWidthContainer
      className={cx(S.ParametersWidgetContainer, {
        [S.isEmbeddingSdk]: isEmbeddingSdk(),
      })}
      aria-busy
      data-testid="dashboard-parameters-skeleton"
    >
      <FixedWidthContainer
        className={DashboardS.ParametersFixedWidthContainer}
        isFixedWidth={isFixedWidth}
      >
        <Flex
          align="center"
          gap="sm"
          data-testid="dashboard-parameters-skeleton-filters"
        >
          {visibleParameters.map((parameter) => (
            <Skeleton key={parameter.id} height={24} width={160} radius="sm" />
          ))}
        </Flex>
      </FixedWidthContainer>
    </FullWidthContainer>
  );
};
