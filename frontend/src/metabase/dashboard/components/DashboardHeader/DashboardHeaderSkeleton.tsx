import cx from "classnames";
import type { ReactNode } from "react";

import { EditableText } from "metabase/common/components/EditableText";
import CS from "metabase/css/core/index.css";
import {
  getIsAdditionalInfoVisible,
  getIsHeaderVisible,
  getIsLastSeenDashboardFixedWidth,
  getLastSeenDashboard,
} from "metabase/dashboard/selectors";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { useSelector } from "metabase/redux";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex, Skeleton, Text, UnstyledButton } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import { FixedWidthContainer } from "../Dashboard/DashboardComponents";

import S from "./DashboardHeaderView.module.css";

// Dashboards render a fixed row of action-icon buttons in their header.
const HEADER_ACTIONS = Array.from({ length: 6 });

/**
 * A skeleton bar laid over an invisible copy of the element it stands in for,
 * so it takes up exactly the height the real element will.
 */
const SkeletonOver = ({
  width,
  height,
  children,
}: {
  width: string;
  height: string;
  children: ReactNode;
}) => (
  <Box pos="relative" w={width}>
    {/* A flex container, like the rows the real elements sit in. */}
    <Flex style={{ visibility: "hidden" }} aria-hidden>
      {children}
    </Flex>
    <Flex pos="absolute" top={0} bottom={0} left={0} right={0} align="center">
      <Skeleton height={height} radius="sm" />
    </Flex>
  </Box>
);

/**
 * The dashboard header as a skeleton, shown while the dashboard loads. It's
 * built from the same layout pieces as `DashboardHeaderView` and follows the
 * same visibility rules, and sizes its title area from the real title and
 * last-edit label, so the header doesn't change height when the dashboard
 * arrives. Tabs come from the dashboard as last seen in the in-memory Redux
 * cache, so the tab row only appears when the dashboard has more than one tab.
 */
export const DashboardHeaderSkeleton = ({
  dashboardId,
  titled,
}: {
  dashboardId: DashboardId | null;
  titled: boolean;
}) => {
  const isHeaderVisible = useSelector(getIsHeaderVisible);
  const isAdditionalInfoVisible = useSelector(getIsAdditionalInfoVisible);
  const lastSeenDashboard = useSelector((state) =>
    getLastSeenDashboard(state, dashboardId),
  );
  const isFixedWidth = useSelector((state) =>
    getIsLastSeenDashboardFixedWidth(state, dashboardId),
  );
  const tabs = lastSeenDashboard?.tabs?.filter((tab) => !tab.isRemoved) ?? [];
  // Without the dashboard in the cache, assume it has an edit history, as
  // nearly every dashboard does.
  const hasLastEditInfo =
    lastSeenDashboard == null || lastSeenDashboard["last-edit-info"] != null;
  const isLastEditInfoVisible = hasLastEditInfo && isAdditionalInfoVisible;

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
                // The real header mounts with its sub-header shown.
                <Box
                  className={cx(S.HeaderContent, S.showSubHeader)}
                  data-testid="dashboard-header-skeleton-title"
                >
                  <Flex className={S.HeaderCaptionContainer}>
                    <SkeletonOver width="14rem" height="1.5rem">
                      <EditableText
                        className={S.HeaderCaption}
                        initialValue=""
                        isDisabled
                      />
                    </SkeletonOver>
                  </Flex>
                  <Flex
                    className={S.HeaderBadges}
                    data-testid="dashboard-header-skeleton-badges"
                  >
                    {isLastEditInfoVisible && (
                      <SkeletonOver width="10rem" height="0.875rem">
                        <LastEditInfoLabelSizer />
                      </SkeletonOver>
                    )}
                  </Flex>
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

/**
 * An empty line of the dashboard's last-edit label, rendered as the same
 * element `LastEditInfoLabel` uses in this context so it has the same height.
 */
const LastEditInfoLabelSizer = () =>
  isEmbeddingSdk() ? (
    <Text className={S.HeaderLastEditInfoLabel} size="sm" fw="bold">
      {" "}
    </Text>
  ) : (
    <UnstyledButton
      className={S.HeaderLastEditInfoLabel}
      fz="sm"
      fw="bold"
      tabIndex={-1}
    >
      {" "}
    </UnstyledButton>
  );
