import cx from "classnames";

import CS from "metabase/css/core/index.css";
import {
  getIsHeaderVisible,
  getIsLastSeenDashboardFixedWidth,
  getLastSeenDashboard,
} from "metabase/dashboard/selectors";
import { useSelector } from "metabase/redux";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex, Skeleton } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import { FixedWidthContainer } from "../Dashboard/DashboardComponents";

import S from "./DashboardHeaderView.module.css";

// Dashboards render a fixed row of action-icon buttons in their header.
const HEADER_ACTIONS = Array.from({ length: 6 });

/**
 * The dashboard header as a skeleton, shown while the dashboard loads. It's
 * built from the same layout pieces as `DashboardHeaderView` and follows the
 * same visibility rules. Tabs come from the dashboard as last seen in the
 * in-memory Redux cache, so the tab row only appears when the dashboard has
 * more than one tab.
 */
export const DashboardHeaderSkeleton = ({
  dashboardId,
  titled,
}: {
  dashboardId: DashboardId | null;
  titled: boolean;
}) => {
  const isHeaderVisible = useSelector(getIsHeaderVisible);
  const lastSeenDashboard = useSelector((state) =>
    getLastSeenDashboard(state, dashboardId),
  );
  const isFixedWidth = useSelector((state) =>
    getIsLastSeenDashboardFixedWidth(state, dashboardId),
  );
  const tabs = lastSeenDashboard?.tabs?.filter((tab) => !tab.isRemoved) ?? [];

  return (
    <div
      className={S.DashboardHeader}
      aria-busy
      data-testid="dashboard-header-skeleton"
    >
      <div className={S.HeaderContainer}>
        {isHeaderVisible && (
          <FullWidthContainer className={cx(CS.wrapper, S.HeaderRow)}>
            <FixedWidthContainer
              className={S.HeaderFixedWidthContainer}
              isFixedWidth={isFixedWidth}
            >
              {titled && (
                <Box
                  className={S.HeaderContent}
                  data-testid="dashboard-header-skeleton-title"
                >
                  <Skeleton height="1.5rem" width="14rem" radius="sm" />
                </Box>
              )}
              <Flex className={S.HeaderButtonsContainer}>
                <Flex
                  className={S.HeaderButtonSection}
                  data-testid="dashboard-header-skeleton-actions"
                >
                  {HEADER_ACTIONS.map((_, index) => (
                    <Skeleton
                      key={index}
                      height="2rem"
                      width="2rem"
                      radius="sm"
                    />
                  ))}
                </Flex>
              </Flex>
            </FixedWidthContainer>
          </FullWidthContainer>
        )}
        {tabs.length > 1 && (
          <FullWidthContainer className={S.HeaderRow}>
            <FixedWidthContainer
              className={S.HeaderFixedWidthContainer}
              isFixedWidth={isFixedWidth}
            >
              <Flex
                align="center"
                gap="lg"
                h="2.5rem"
                data-testid="dashboard-header-skeleton-tabs"
              >
                {tabs.map((tab) => (
                  <Skeleton
                    key={tab.id}
                    height="1rem"
                    width="4rem"
                    radius="sm"
                  />
                ))}
              </Flex>
            </FixedWidthContainer>
          </FullWidthContainer>
        )}
      </div>
    </div>
  );
};
