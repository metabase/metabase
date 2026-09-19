import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Text } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";

import {
  getEndReasonLabel,
  getProviderLabel,
  getSessionTypeLabel,
  getSessionUserName,
} from "../utils";

import { DetailsRow } from "./DetailsRow";
import { DetailsTable } from "./DetailsTable";
import { SidebarSection } from "./SidebarSection";
import type { SessionDetailsProps } from "./types";

const DateValue = ({ value }: { value: string }) => (
  <Text size="md" c="text-primary">
    <DateTime value={value} unit="minute" />
  </Text>
);

export const SessionDetails = ({ session }: SessionDetailsProps) => {
  const isEnded = session.status === "ended";

  return (
    <SidebarSection title={t`Details`}>
      <DetailsTable>
        <DetailsRow
          label={t`User`}
          value={getSessionUserName(session.user)}
          bold
        />
        <DetailsRow label={t`Email`} value={session.user.email} />
        <DetailsRow
          label={t`Auth method`}
          value={getProviderLabel(session.provider)}
        />
        <DetailsRow
          label={t`Session type`}
          value={getSessionTypeLabel(session.type)}
        />
        <DetailsRow
          label={t`Device`}
          value={session.device_description ?? EMPTY_CELL_PLACEHOLDER}
        />
        <DetailsRow
          label={t`User agent`}
          value={session.user_agent ?? EMPTY_CELL_PLACEHOLDER}
        />
        <DetailsRow
          label={t`IP address`}
          value={session.ip_address ?? EMPTY_CELL_PLACEHOLDER}
        />
        <DetailsRow
          label={t`Device ID`}
          value={session.device_id ?? EMPTY_CELL_PLACEHOLDER}
        />
        <DetailsRow
          label={t`Signed in`}
          value={<DateValue value={session.created_at} />}
        />
        <DetailsRow
          label={t`Last active`}
          value={
            session.last_active_at ? (
              <DateValue value={session.last_active_at} />
            ) : (
              EMPTY_CELL_PLACEHOLDER
            )
          }
        />
        {isEnded ? (
          <>
            <DetailsRow
              label={t`Ended`}
              value={
                session.ended_at ? (
                  <DateValue value={session.ended_at} />
                ) : (
                  EMPTY_CELL_PLACEHOLDER
                )
              }
            />
            <DetailsRow
              label={t`Reason`}
              value={
                session.end_reason
                  ? getEndReasonLabel(session.end_reason)
                  : EMPTY_CELL_PLACEHOLDER
              }
            />
          </>
        ) : (
          <DetailsRow
            label={t`Expires`}
            value={<DateValue value={session.expires_at} />}
          />
        )}
      </DetailsTable>
    </SidebarSection>
  );
};
