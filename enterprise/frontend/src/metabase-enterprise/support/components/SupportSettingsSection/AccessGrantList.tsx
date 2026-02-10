import cx from "classnames";
import dayjs, { type Dayjs } from "dayjs";
import { c, t } from "ttag";

import { useConfirmation } from "metabase/common/hooks";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Badge, Group, Icon } from "metabase/ui";
import { useRevokeSupportAccessGrantMutation } from "metabase-enterprise/api";
import type { SupportAccessGrant } from "metabase-types/api";

interface AccessGrantListProps {
  accessGrants: SupportAccessGrant[];
}

export const AccessGrantList = (props: AccessGrantListProps) => {
  const { accessGrants } = props;
  const [revokeSupportAccessGrant, { isLoading: isRevoking }] =
    useRevokeSupportAccessGrantMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const { modalContent, show } = useConfirmation();

  const handleRevokeAccessGrant = async (grantId: number) => {
    show({
      title: t`Revoke access grant?`,
      message: t`This will immediately revoke the support agent's access to your instance.`,
      confirmButtonText: t`Revoke`,
      confirmButtonProps: { color: "danger" },
      size: "sm",
      onConfirm: async () => {
        try {
          await revokeSupportAccessGrant(grantId).unwrap();
          sendSuccessToast(t`Access grant revoked successfully`);
        } catch {
          sendErrorToast(t`Sorry, something went wrong. Please try again.`);
        }
      },
    });
  };
  const now = dayjs();

  return (
    <>
      <table
        data-testid="access-grant-list-table"
        className={cx(AdminS.ContentTable, CS.borderBottom)}
      >
        <thead>
          <tr>
            <th style={{ paddingLeft: 0 }}>{t`Date`}</th>
            <th>{t`Ticket`}</th>
            <th>{t`Notes`}</th>
            <th>{t`Request creator`}</th>
            <th>{t`Expired`}</th>
          </tr>
        </thead>
        <tbody>
          {accessGrants.map((grant) => {
            const startDate = dayjs(grant.grant_start_timestamp);
            const effectiveEndDate = dayjs(
              grant.revoked_at || grant.grant_end_timestamp,
            );

            return (
              <tr key={grant.id}>
                <td style={{ paddingLeft: 0 }}>{startDate.format("lll")}</td>
                <td>{grant.ticket_number || "-"}</td>
                <td>{grant.notes || "-"}</td>
                <td>{grant.user_name || grant.user_email || grant.user_id}</td>
                <td>
                  {effectiveEndDate.isBefore(now) ? (
                    effectiveEndDate.format("lll")
                  ) : (
                    <Group gap="sm">
                      <Badge
                        m={0}
                        variant="outline"
                        title={effectiveEndDate.format("lll")}
                      >
                        {c("{0} is the time until expiration")
                          .t`${getTimeLeft(effectiveEndDate)} left`}
                      </Badge>
                      <ActionIcon
                        aria-label={t`Revoke access grant`}
                        loading={isRevoking}
                        onClick={() => handleRevokeAccessGrant(grant.id)}
                        size="sm"
                        title={t`Revoke access grant`}
                        variant="viewHeader"
                      >
                        <Icon name="close" />
                      </ActionIcon>
                    </Group>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {modalContent}
    </>
  );
};

const getTimeLeft = (date: Dayjs) => {
  const hourDiff = date.diff(dayjs(), "hours", true);

  if (hourDiff > 1 && hourDiff <= 48) {
    return c("{0} is the number of hours").t`${Math.round(hourDiff)} hours`;
  }

  return date.toNow(true);
};
