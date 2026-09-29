import type { StoreDashcard } from "metabase/redux/store";
import { Box, Flex, Skeleton } from "metabase/ui";

import { DashboardGridSkeleton } from "../DashboardGridSkeleton";

import S from "./DashboardSkeleton.module.css";

// Dashboards render a fixed row of action-icon buttons in their header.
const HEADER_ACTION_COUNT = 6;
const HEADER_ACTIONS = Array.from({ length: HEADER_ACTION_COUNT });
const TAB_COUNT = 2;
const TABS = Array.from({ length: TAB_COUNT });

/**
 * A skeleton of the whole dashboard — its header (title, action buttons, tabs)
 * and its card layout — shown instantly when a dashboard is opened so that a
 * loading spinner is never displayed. When the card layout is known (cached
 * from a prior visit) the real layout is drawn; otherwise a generic placeholder
 * layout is used. Once the real dashboard mounts, its cards keep their own
 * per-card content skeletons.
 */
export const DashboardSkeleton = ({
  cards,
  filterCount = 0,
}: {
  cards?: readonly StoreDashcard[];
  filterCount?: number;
}) => (
  <Flex
    direction="column"
    mih="100%"
    w="100%"
    flex="1 0 auto"
    data-testid="dashboard-skeleton"
  >
    <Box className={S.header}>
      <div className={S.inner}>
        <div className={S.headerRow}>
          <Skeleton height="1.5rem" width="14rem" radius="sm" />
          <Flex className={S.actions} data-testid="dashboard-skeleton-actions">
            {HEADER_ACTIONS.map((_, index) => (
              <Skeleton key={index} height="2rem" width="2rem" radius="sm" />
            ))}
          </Flex>
        </div>
        <div className={S.tabsRow} data-testid="dashboard-skeleton-tabs">
          {TABS.map((_, index) => (
            <Skeleton key={index} height="1rem" width="4rem" radius="sm" />
          ))}
        </div>
      </div>
    </Box>

    <Box className={S.body}>
      <div className={S.inner}>
        {filterCount > 0 && (
          <div
            className={S.filtersRow}
            data-testid="dashboard-skeleton-filters"
          >
            {Array.from({ length: filterCount }).map((_, index) => (
              <Skeleton key={index} height="1rem" width="4rem" radius="sm" />
            ))}
          </div>
        )}
        <div className={S.cards}>
          <DashboardGridSkeleton cards={cards} />
        </div>
      </div>
    </Box>
  </Flex>
);
