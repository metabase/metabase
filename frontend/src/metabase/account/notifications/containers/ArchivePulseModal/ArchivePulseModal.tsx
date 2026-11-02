import { skipToken } from "@reduxjs/toolkit/query/react";

import {
  useGetSubscriptionQuery,
  useUpdateSubscriptionMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSearchParams } from "metabase/router";

import { ArchiveNotificationModal } from "../../components/ArchiveModal";
import { NotificationModalContentSkeleton } from "../../components/NotificationModalSkeleton";
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

  if (isLoading) {
    return <NotificationModalContentSkeleton onClose={onClose} />;
  }

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  return pulse && user ? (
    <ArchiveNotificationModal
      item={pulse}
      type="pulse"
      user={user}
      hasUnsubscribed={Boolean(searchParams.get("unsubscribed"))}
      onArchive={handleArchive}
      onClose={onClose}
    />
  ) : null;
}
