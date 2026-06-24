import { t } from "ttag";

import { summarizeChannels } from "metabase/monitor/tools/notifications/utils";
import { Flex, Stack, Text } from "metabase/ui";

import { trackAlertsManagementRunHistoryViewAllClicked } from "../analytics";

import { DetailsSection } from "./DetailsSection";
import { DetailsTable } from "./DetailsTable";
import { NotificationRunSummaryLog } from "./NotificationRunSummaryLog";
import { SidebarSection } from "./SidebarSection";
import type { SidebarBodyProps } from "./types";
import {
  getEmailRecipientLabel,
  getEmailRowText,
  getSlackChannelLabel,
} from "./utils";

export const SidebarBody = ({
  notification,
  isDetailFetching,
  detail,
}: SidebarBodyProps) => {
  const channelSummaries = summarizeChannels(notification);
  const emailSummary = channelSummaries["channel/email"];
  const slackSummary = channelSummaries["channel/slack"];
  const emailRecipientCount = emailSummary.count;
  const slackChannelCount = slackSummary.count;
  const webhookCount = channelSummaries["channel/http"].count;

  const cardId = notification.payload?.card_id;

  return (
    <Stack gap="xl">
      <DetailsSection
        notification={notification}
        emailRecipientCount={emailRecipientCount}
        slackChannelCount={slackChannelCount}
        webhookCount={webhookCount}
      />
      <NotificationRunSummaryLog
        title={t`Check history`}
        runs={detail?.check_history}
        isLoading={isDetailFetching}
        cardId={cardId}
        onViewAllClick={() =>
          trackAlertsManagementRunHistoryViewAllClicked(cardId, "check")
        }
      />
      <NotificationRunSummaryLog
        title={t`Send history`}
        runs={detail?.send_history}
        isLoading={isDetailFetching}
        cardId={cardId}
        onViewAllClick={() =>
          trackAlertsManagementRunHistoryViewAllClicked(cardId, "send")
        }
      />
      {emailRecipientCount > 0 && (
        <SidebarSection title={getEmailRecipientLabel(emailRecipientCount)}>
          <DetailsTable>
            {emailSummary.recipients.map((recipient, index) => {
              const { name, email } = getEmailRowText(recipient);
              return (
                <Flex
                  key={recipient.id ?? index}
                  align="center"
                  justify="space-between"
                  px="md"
                  py="sm"
                  gap="sm"
                >
                  <Text size="md" c="text-primary">
                    {name}
                  </Text>
                  {email && (
                    <Text size="md" c="text-secondary">
                      {email}
                    </Text>
                  )}
                </Flex>
              );
            })}
          </DetailsTable>
        </SidebarSection>
      )}
      {slackChannelCount > 0 && (
        <SidebarSection title={getSlackChannelLabel(slackChannelCount)}>
          <DetailsTable>
            {slackSummary.recipients.map((recipient, index) => (
              <Flex key={recipient.id ?? index} align="center" px="md" py="sm">
                <Text size="md" c="text-primary">
                  {recipient.details.value}
                </Text>
              </Flex>
            ))}
          </DetailsTable>
        </SidebarSection>
      )}
    </Stack>
  );
};
