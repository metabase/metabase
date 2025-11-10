import cx from "classnames";
import dayjs from "dayjs";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Button } from "metabase/ui";
import { useRevokeSupportAccessGrantMutation } from "metabase-enterprise/api";
import type { SupportAccessGrant } from "metabase-types/api";

interface AccessGrantListProps {
  accessGrants: SupportAccessGrant[];
  active?: boolean;
}

export const AccessGrantList = (props: AccessGrantListProps) => {
  const { accessGrants, active } = props;
  const [revokeSupportAccessGrant, { isLoading: isRevoking }] =
    useRevokeSupportAccessGrantMutation();
  const [sendToast] = useToast();

  const handleRevokeAccessGrant = async (grantId: number) => {
    try {
      await revokeSupportAccessGrant(grantId).unwrap();
    } catch {
      sendToast({
        message: t`Sorry, something went wrong. Please try again.`,
        icon: "warning",
      });
    }
  };

  return (
    <table
      data-testid="access-grant-list-table"
      className={cx(AdminS.ContentTable, CS.borderBottom)}
    >
      <thead>
        <tr>
          <th>{t`Ticket`}</th>
          <th>{t`User ID`}</th>
          <th>{t`Starts at`}</th>
          <th>{t`Ends at`}</th>
          {!active && <th>{t`Revoked at`}</th>}
          {active && <th></th>}
        </tr>
      </thead>
      <tbody>
        {accessGrants.map((grant) => (
          <tr key={grant.id}>
            <td>{grant.ticket_number}</td>
            <td>{grant.user_id}</td>
            <td>{dayjs(grant.grant_start_timestamp).format("lll")}</td>
            <td>{dayjs(grant.grant_end_timestamp).format("lll")}</td>
            {!active && (
              <td>
                {grant.revoked_at ? dayjs(grant.revoked_at).format("lll") : "-"}
              </td>
            )}
            {active && (
              <td style={{ textAlign: "right" }}>
                <Button
                  loading={isRevoking}
                  onClick={() => handleRevokeAccessGrant(grant.id)}
                  size="xs"
                >
                  {t`Revoke`}
                </Button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
