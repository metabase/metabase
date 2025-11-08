import cx from "classnames";
import dayjs from "dayjs";
import { t } from "ttag";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { DEFAULT_DATE_STYLE } from "metabase/lib/formatting/datetime-utils";
import type { SupportAccessGrant } from "metabase-types/api";

interface AccessGrantListProps {
  accessGrants: SupportAccessGrant[];
  active?: boolean;
}

export const AccessGrantList = (props: AccessGrantListProps) => {
  const { accessGrants, active } = props;

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
        </tr>
      </thead>
      <tbody>
        {accessGrants.map((grant) => (
          <tr key={grant.id}>
            <td>{grant.ticket_number}</td>
            <td>{grant.user_id}</td>
            <td>
              {dayjs(grant.grant_start_timestamp).format(DEFAULT_DATE_STYLE)}
            </td>
            <td>
              {dayjs(grant.grant_end_timestamp).format(DEFAULT_DATE_STYLE)}
            </td>
            {!active && (
              <td>
                {grant.revoked_at
                  ? dayjs(grant.revoked_at).format(DEFAULT_DATE_STYLE)
                  : "-"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
