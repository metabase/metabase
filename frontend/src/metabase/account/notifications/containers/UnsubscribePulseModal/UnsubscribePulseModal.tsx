import { skipToken } from "@reduxjs/toolkit/query/react";

import { useGetSubscriptionQuery, useUnsubscribeMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import { navigateToArchive } from "../../actions";
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
  const dispatch = useDispatch();
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
    dispatch(navigateToArchive(item, "pulse", hasUnsubscribed));
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
