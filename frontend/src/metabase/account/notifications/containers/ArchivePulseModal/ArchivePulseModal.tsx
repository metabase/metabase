import { skipToken } from "@reduxjs/toolkit/query/react";
import type { Location } from "history";

import {
  useGetSubscriptionQuery,
  useUpdateSubscriptionMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import { ArchiveNotificationModal } from "../../components/ArchiveModal";
import { getPulseId } from "../../selectors";

type ArchivePulseModalProps = {
  params: { pulseId?: string };
  location: Location;
  onClose: () => void;
};

export function ArchivePulseModal({
  params,
  location,
  onClose,
}: ArchivePulseModalProps) {
  const pulseId = getPulseId({ params });
  const user = useSelector(getUser);

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

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return pulse && user ? (
    <ArchiveNotificationModal
      item={pulse}
      type="pulse"
      user={user}
      hasUnsubscribed={Boolean(location.query?.unsubscribed)}
      onArchive={handleArchive}
      onClose={onClose}
    />
  ) : null;
}
