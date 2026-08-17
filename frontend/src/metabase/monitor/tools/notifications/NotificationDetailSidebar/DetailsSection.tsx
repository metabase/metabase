import { t } from "ttag";

import { Link as MBLink } from "metabase/common/components/Link";
import * as Urls from "metabase/urls";

import { NotificationSummary } from "../NotificationSummary";

import { DetailsRow } from "./DetailsRow";
import { DetailsTable } from "./DetailsTable";
import { SidebarSection } from "./SidebarSection";
import type { DetailsSectionProps } from "./types";
import { formatChannelSummary } from "./utils";

export const DetailsSection = ({
  notification,
  emailRecipientCount,
  slackChannelCount,
  webhookCount,
}: DetailsSectionProps) => {
  const cardId = notification.payload?.card_id;
  const cardName = notification.payload?.card?.name;
  const channelSummary = formatChannelSummary({
    emailRecipientCount,
    slackChannelCount,
    webhookCount,
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
            <NotificationSummary
              run={notification.last_check}
              isCompact={false}
            />
          }
        />
        <DetailsRow
          label={t`Last send attempt`}
          value={
            <NotificationSummary
              run={notification.last_send}
              isCompact={false}
            />
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
};
