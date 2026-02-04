import type { Location } from "history";

import {
  useGetSubscriptionQuery,
  useUpdateSubscriptionMutation,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import ArchiveModal from "../../components/ArchiveModal";
import { getPulseId } from "../../selectors";

type ArchivePulseModalProps = {
  params: { pulseId?: string };
  location: Location;
  onClose: () => void;
};

function ArchivePulseModal({
  params,
  location,
  onClose,
}: ArchivePulseModalProps): React.JSX.Element | null {
  const pulseId = getPulseId({ params });
  const user = useSelector(getUser);

  const { data: pulse } = useGetSubscriptionQuery(pulseId!, {
    skip: pulseId == null,
  });

  const [updateSubscription] = useUpdateSubscriptionMutation();

  const handleArchive = async (
    item: { id: number },
    archived: boolean,
  ): Promise<void> => {
    await updateSubscription({ id: item.id, archived });
  };

  if (!pulse) {
    return null;
  }

  return (
    <ArchiveModal
      item={pulse}
      type="pulse"
      user={user}
      hasUnsubscribed={Boolean(location.query?.unsubscribed)}
      onArchive={handleArchive}
      onClose={onClose}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ArchivePulseModal;
