import { skipToken } from "@reduxjs/toolkit/query/react";

import { useGetSubscriptionQuery, useUnsubscribeMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";

import { getArchiveUrl } from "../../actions";
import { UnsubscribeModal } from "../../components/UnsubscribeModal";
import { getPulseId } from "../../selectors";

type UnsubscribePulseModalProps = {
  params: { pulseId?: string };
  onClose: () => void;
};

export function UnsubscribePulseModal({
  params,
  onClose,
}: UnsubscribePulseModalProps) {
  const navigate = useNavigate();
  const pulseId = getPulseId({ params });
  const user = useSelector(getUser);

  const {
    data: pulse,
    isLoading,
    error,
  } = useGetSubscriptionQuery(pulseId ?? skipToken);

  const [unsubscribe] = useUnsubscribeMutation();

  const handleUnsubscribe = async (item: { id: number }): Promise<void> => {
    await unsubscribe(item.id);
  };

  const handleArchive = (
    item: { id: number },
    _type: "alert" | "pulse",
    hasUnsubscribed: boolean,
  ): void => {
    navigate(getArchiveUrl(item, "pulse", hasUnsubscribed));
  };

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return pulse && user ? (
    <UnsubscribeModal
      item={pulse}
      type="pulse"
      user={user}
      onUnsubscribe={handleUnsubscribe}
      onArchive={handleArchive}
      onClose={onClose}
    />
  ) : null;
}
