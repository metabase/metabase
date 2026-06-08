import { t } from "ttag";

import { Flex, Stack, Text } from "metabase/ui";
import type {
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
} from "metabase-types/api";

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
  const handlers = notification.handlers ?? [];
  const emailHandler = handlers.find(
    (handler): handler is NotificationHandlerEmail =>
      handler.channel_type === "channel/email",
  );
  const slackHandler = handlers.find(
    (handler): handler is NotificationHandlerSlack =>
      handler.channel_type === "channel/slack",
  );
  // Webhook handlers target the configured HTTP channel via channel_id, not recipients.
  const webhookCount = handlers.filter(
    (handler): handler is NotificationHandlerHttp =>
      handler.channel_type === "channel/http",
  ).length;
  const emailRecipientCount = emailHandler?.recipients.length ?? 0;
  const slackChannelCount = slackHandler?.recipients.length ?? 0;

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
      {emailHandler && emailRecipientCount > 0 && (
        <SidebarSection title={getEmailRecipientLabel(emailRecipientCount)}>
          <DetailsTable>
            {emailHandler.recipients.map((recipient, index) => {
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
      {slackHandler && slackChannelCount > 0 && (
        <SidebarSection title={getSlackChannelLabel(slackChannelCount)}>
          <DetailsTable>
            {slackHandler.recipients.map((recipient, index) => (
              <Flex key={recipient.id ?? index} align="center" px="md" py="sm">
                <Text size="md" c="text-primary">
                  {recipient.details?.value ?? ""}
                </Text>
              </Flex>
            ))}
          </DetailsTable>
        </SidebarSection>
      )}
    </Stack>
  );
};
