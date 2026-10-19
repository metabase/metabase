import { skipToken } from "@reduxjs/toolkit/query/react";

import {
  useGetSubscriptionQuery,
  useUpdateSubscriptionMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSearchParams } from "metabase/router";
import { Modal } from "metabase/ui";

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

  // Opening the modal once the subscription loads, rather than around a
  // spinner, saves it from animating in twice
  if (isLoading) {
    return null;
  }

  if (error) {
    return (
      <Modal opened size="lg" onClose={onClose}>
        <LoadingAndErrorWrapper loading={false} error={error} />
      </Modal>
    );
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
