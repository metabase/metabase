import { skipToken } from "@reduxjs/toolkit/query/react";

import { useGetSubscriptionQuery, useUnsubscribeMutation } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import { navigateToArchive } from "../../actions";
import UnsubscribeModal from "../../components/UnsubscribeModal";
import { getPulseId } from "../../selectors";

type UnsubscribePulseModalProps = {
  params: { pulseId?: string };
  onClose: () => void;
};

function UnsubscribePulseModal({
  params,
  onClose,
}: UnsubscribePulseModalProps): JSX.Element | null {
  const dispatch = useDispatch();
  const pulseId = getPulseId({ params });
  const user = useSelector(getUser);

  const { data: pulse } = useGetSubscriptionQuery(pulseId ?? skipToken);

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

  if (!pulse) {
    return null;
  }

  return (
    <UnsubscribeModal
      item={pulse}
      type="pulse"
      user={user}
      onUnsubscribe={handleUnsubscribe}
      onArchive={handleArchive}
      onClose={onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UnsubscribePulseModal;
