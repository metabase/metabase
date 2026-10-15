import { t } from "ttag";

import { skipToken, useGetChannelInfoQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { useCanManageDashboardSubscriptions } from "metabase/dashboard/hooks";
import { SidebarResizableBox } from "metabase/monitor/components/MonitorLayout/SidebarResizableBox";
import { getSubscriptionEditUnavailableReason } from "metabase/notifications/pulse/subscription-editing";
import { useSetting } from "metabase/settings";
import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Channel,
  Dashboard,
  DashboardSubscription,
} from "metabase-types/api";

import {
  CHANNEL_ICONS,
  SIDEBAR_WIDTH,
  TOOLTIP_OPEN_DELAY_MS,
} from "../constants";
import { type SubscriptionSelection, formatChannelSchedule } from "../utils";

import { InfoSection } from "./InfoSection";
import S from "./SubscriptionSidebar.module.css";

type SubscriptionSidebarProps = {
  dashboard: Dashboard;
  selection: Exclude<SubscriptionSelection, { type: "none" }>;
  closeUrl: string;
  containerWidth: number;
};

export function SubscriptionSidebar({
  dashboard,
  selection,
  closeUrl,
  containerWidth,
}: SubscriptionSidebarProps) {
  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      defaultWidth={SIDEBAR_WIDTH}
    >
      <Stack
        className={S.sidebar}
        p="lg"
        gap="lg"
        bg="background_page-primary"
        role="region"
        aria-label={t`Subscription details`}
        data-testid="subscription-details"
      >
        {selection.type === "found" ? (
          <>
            <SidebarHeader
              dashboard={dashboard}
              subscription={selection.subscription}
              channel={selection.channel}
              closeUrl={closeUrl}
            />
            <InfoSection
              subscription={selection.subscription}
              channel={selection.channel}
              parameters={dashboard.parameters ?? []}
            />
          </>
        ) : (
          <Group
            gap="0.75rem"
            wrap="nowrap"
            align="start"
            justify="space-between"
          >
            <Text fz="h3" fw="bold" lh="h3">
              {t`Subscription not found`}
            </Text>
            <CloseLink closeUrl={closeUrl} />
          </Group>
        )}
      </Stack>
    </SidebarResizableBox>
  );
}

type SidebarHeaderProps = {
  dashboard: Dashboard;
  subscription: DashboardSubscription;
  channel: Channel;
  closeUrl: string;
};

function SidebarHeader({
  dashboard,
  subscription,
  channel,
  closeUrl,
}: SidebarHeaderProps) {
  const timezone = useSetting("report-timezone-short");

  return (
    <Group gap="0.75rem" wrap="nowrap" align="start" justify="space-between">
      <Group gap="sm" wrap="nowrap" align="center" miw={0}>
        <FixedSizeIcon name={CHANNEL_ICONS[channel.channel_type]} aria-hidden />
        <Text className={CS.textWrap} fz="h3" fw="bold" lh="h3">
          {formatChannelSchedule(channel, timezone)}
        </Text>
      </Group>
      <Group gap="xs" wrap="nowrap">
        <EditOnDashboardAction
          dashboard={dashboard}
          subscription={subscription}
          channel={channel}
        />
        <CloseLink closeUrl={closeUrl} />
      </Group>
    </Group>
  );
}

type CloseLinkProps = {
  closeUrl: string;
};

function CloseLink({ closeUrl }: CloseLinkProps) {
  return (
    <ActionIcon
      variant="subtle"
      component={ForwardRefLink}
      to={closeUrl}
      aria-label={t`Close`}
    >
      <FixedSizeIcon name="close" />
    </ActionIcon>
  );
}

type EditOnDashboardActionProps = {
  dashboard: Dashboard;
  subscription: DashboardSubscription;
  channel: Channel;
};

function EditOnDashboardAction({
  dashboard,
  subscription,
  channel,
}: EditOnDashboardActionProps) {
  const canManageSubscriptions = useCanManageDashboardSubscriptions(dashboard);
  const {
    data: channelInfo,
    isLoading,
    error,
  } = useGetChannelInfoQuery(canManageSubscriptions ? undefined : skipToken);

  if (!canManageSubscriptions) {
    return null;
  }

  if (isLoading) {
    return <DisabledEditAction reason={null} />;
  }

  if (error != null || channelInfo == null) {
    return (
      <DisabledEditAction reason={t`Couldn't load the notification channels`} />
    );
  }

  const unavailableReason = getSubscriptionEditUnavailableReason(
    channel,
    channelInfo,
  );
  if (unavailableReason != null) {
    return <DisabledEditAction reason={unavailableReason} />;
  }

  return (
    <Tooltip label={t`Edit on dashboard`} openDelay={TOOLTIP_OPEN_DELAY_MS}>
      <ActionIcon
        variant="subtle"
        component={ForwardRefLink}
        to={Urls.dashboard(dashboard, { openSubscriptions: subscription.id })}
        aria-label={t`Edit on dashboard`}
      >
        <FixedSizeIcon name="pencil" />
      </ActionIcon>
    </Tooltip>
  );
}

type DisabledEditActionProps = {
  /** Why the subscription can't be edited, or `null` while that's unknown. */
  reason: string | null;
};

function DisabledEditAction({ reason }: DisabledEditActionProps) {
  return (
    <Tooltip label={reason} disabled={reason == null}>
      {/* a disabled button fires no pointer events, so the tooltip listens on a wrapper */}
      <Box>
        <ActionIcon variant="subtle" aria-label={t`Edit on dashboard`} disabled>
          <FixedSizeIcon name="pencil" />
        </ActionIcon>
      </Box>
    </Tooltip>
  );
}
