import { skipToken } from "@reduxjs/toolkit/query/react";
import { useState } from "react";
import { t } from "ttag";

import {
  useGetSubscriptionQuery,
  useUpdateSubscriptionMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import { FormMessage } from "metabase/forms";
import { formatChannelRecipients } from "metabase/pulse";
import { useSelector } from "metabase/redux";
import { useSearchParams } from "metabase/router";
import { Box, Button, Modal, Stack } from "metabase/ui";
import Settings from "metabase/utils/settings";
import { formatDateTimeWithUnit } from "metabase/value-formatting";
import type { DashboardSubscription, User } from "metabase-types/api";

import { getPulseId } from "../../selectors";

type ArchivePulseModalProps = {
  params: { pulseId?: string };
  onClose: () => void;
};

export function ArchivePulseModal({ params, onClose }: ArchivePulseModalProps) {
  const pulseId = getPulseId({ params });
  const user = useSelector(getUser);
  const [searchParams] = useSearchParams();
  const hasUnsubscribed = Boolean(searchParams.get("unsubscribed"));

  const {
    data: pulse,
    isLoading,
    error,
  } = useGetSubscriptionQuery(pulseId ?? skipToken);

  if (!user) {
    return null;
  }

  return (
    <Modal
      opened
      size="lg"
      title={
        hasUnsubscribed
          ? t`You're unsubscribed. Delete this subscription as well?`
          : t`Delete this subscription?`
      }
      onClose={onClose}
    >
      {isLoading || error || !pulse ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <ArchivePulseModalBody
          pulse={pulse}
          user={user}
          hasUnsubscribed={hasUnsubscribed}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

type ArchivePulseModalBodyProps = {
  pulse: DashboardSubscription;
  user: User;
  hasUnsubscribed: boolean;
  onClose: () => void;
};

function ArchivePulseModalBody({
  pulse,
  user,
  hasUnsubscribed,
  onClose,
}: ArchivePulseModalBodyProps) {
  const [updateSubscription] = useUpdateSubscriptionMutation();
  const [error, setError] = useState<unknown>();

  const handleArchiveClick = async () => {
    try {
      await updateSubscription({ id: pulse.id, archived: true }).unwrap();
      onClose();
    } catch (err) {
      setError(err);
    }
  };

  const createdAt = formatDateTimeWithUnit(
    pulse.created_at,
    "day",
    Settings.formattingOptions(),
  );

  return (
    <>
      <Stack gap="lg">
        {user.id === pulse.creator_id && hasUnsubscribed && (
          <Box data-server-date>
            {t`You won't receive this subscription at ${user.email} any more. `}
            {t`As the creator you can also choose to delete this if it's no longer relevant to others as well.`}
          </Box>
        )}
        <Box>
          {t`You created this subscription on ${createdAt}. `}
          {t`It's currently being sent to ${formatChannelRecipients(pulse)}.`}
        </Box>
      </Stack>
      <Modal.Footer>
        {!!error && (
          <Box flex={1}>
            <FormMessage formError={error} noPadding />
          </Box>
        )}
        <Button onClick={onClose}>
          {hasUnsubscribed ? t`Keep it around` : t`I changed my mind`}
        </Button>
        <Button variant="filled" color="negative" onClick={handleArchiveClick}>
          {hasUnsubscribed
            ? t`Delete this subscription`
            : t`Yes, delete this subscription`}
        </Button>
      </Modal.Footer>
    </>
  );
}
