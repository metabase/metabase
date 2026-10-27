import { skipToken } from "@reduxjs/toolkit/query/react";

import {
  useGetSubscriptionQuery,
  useUpdateSubscriptionMutation,
} from "metabase/api";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSearchParams } from "metabase/router";

import { ArchiveNotificationModal } from "../../components/ArchiveModal";
import { getPulseId } from "../../selectors";

type ArchivePulseModalProps = {
  params: { pulseId?: string };
  onClose: () => void;
};

export function ArchivePulseModal({ params, onClose }: ArchivePulseModalProps) {
  const pulseId = getPulseId({ params });
  const user = useSelector(getUser);
  const [searchParams] = useSearchParams();

  const {
    data: pulse,
    isLoading,
    error,
  } = useGetSubscriptionQuery(pulseId ?? skipToken);

  const [updateSubscription] = useUpdateSubscriptionMutation();

  const handleArchive = async (
    item: { id: number },
    archived: boolean,
  ): Promise<void> => {
    await updateSubscription({ id: item.id, archived });
  };

  return user ? (
    <ArchiveNotificationModal
      item={pulse}
      loading={isLoading}
      error={error}
      type="pulse"
      user={user}
      hasUnsubscribed={Boolean(searchParams.get("unsubscribed"))}
      onArchive={handleArchive}
      onClose={onClose}
    />
  ) : null;
}
