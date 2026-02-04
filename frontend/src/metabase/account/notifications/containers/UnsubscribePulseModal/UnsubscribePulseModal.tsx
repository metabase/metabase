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
}: UnsubscribePulseModalProps): React.JSX.Element | null {
  const dispatch = useDispatch();
  const pulseId = getPulseId({ params });
  const user = useSelector(getUser);

  const { data: pulse } = useGetSubscriptionQuery(pulseId!, {
    skip: pulseId == null,
  });

  const [unsubscribe] = useUnsubscribeMutation();

  const handleUnsubscribe = async (item: { id: number }): Promise<void> => {
    await unsubscribe(item.id);
  };

  const handleArchive = (
    item: { id: number },
    type: string,
    hasUnsubscribed: boolean,
  ): void => {
    dispatch(navigateToArchive(item, type, hasUnsubscribed));
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
