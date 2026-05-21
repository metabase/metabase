import { t } from "ttag";

import { Link as MBLink } from "metabase/common/components/Link";
import { Flex, Icon, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";

import { formatRelativeDate } from "../NotificationsAdminPage/utils";

import { DetailsRow } from "./DetailsRow";
import { DetailsTable } from "./DetailsTable";
import { SidebarSection } from "./SidebarSection";
import type { DetailsSectionProps } from "./types";
import { formatChannelSummary } from "./utils";

export const DetailsSection = ({
  notification,
  emailRecipientCount,
  slackChannelCount,
  httpHandler,
}: DetailsSectionProps) => {
  const cardId = notification.payload.card_id;
  const cardName = notification.payload.card?.name;
  const lastCheck = notification.last_check;
  const lastSend = notification.last_send;
  const lastCheckDate = formatRelativeDate(lastCheck?.at);
  const lastSendDate = formatRelativeDate(lastSend?.at);
  const checkError = lastCheck?.status === "failing" ? lastCheck.error : null;
  const sendError = lastSend?.status === "failing" ? lastSend.error : null;
  const channelSummary = formatChannelSummary({
    emailRecipientCount,
    slackChannelCount,
    httpHandler,
  });
  const creator = notification.creator;
  const ownerName = creator?.common_name ?? creator?.email ?? t`Unknown`;

  return (
    <SidebarSection title={t`Details`}>
      <DetailsTable>
        <DetailsRow
          label={t`Question`}
          value={
            cardName ? (
              <MBLink
                variant="brandBold"
                to={Urls.card({ id: cardId, name: cardName })}
              >
                {cardName}
              </MBLink>
            ) : (
              t`Unknown`
            )
          }
          bold
        />
        <DetailsRow label={t`Owner`} value={ownerName} />
        <DetailsRow
          label={t`Channel`}
          value={channelSummary || t`No channels`}
        />
        <DetailsRow
          label={t`Last checked`}
          value={
            <Stack gap={4}>
              <Text size="md" c="text-primary">
                {lastCheckDate}
              </Text>
              {checkError && (
                <Flex align="center" gap="xs">
                  <Text size="sm" c="error">
                    {checkError}
                  </Text>
                  <Icon name="warning_round" c="error" size={14} />
                </Flex>
              )}
            </Stack>
          }
        />
        <DetailsRow
          label={t`Last send attempt`}
          value={
            <Stack gap={4}>
              <Text size="md" c="text-primary">
                {lastSendDate}
              </Text>
              {sendError && (
                <Flex align="center" gap="xs">
                  <Text size="sm" c="error">
                    {sendError}
                  </Text>
                  <Icon name="warning_round" c="error" size={14} />
                </Flex>
              )}
            </Stack>
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
};
