import type { Location } from "history";
import { t } from "ttag";

import {
  skipToken,
  useGetSubscriptionQuery,
  useUpdateSubscriptionMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import ArchiveModal from "../../components/ArchiveModal";
import { getPulseId } from "../../selectors";

export const ArchivePulseModal = (props: {
  params: { pulseId?: string };
  location: Location<{ unsubscribed?: boolean }>;
  onClose: () => void;
}) => {
  const pulseId = getPulseId(props);

  const [sendToast] = useToast();
  const currentUser = useSelector(getUser);

  const hasUnsubscribed = props.location.query?.unsubscribed;

  const pulseQuery = useGetSubscriptionQuery(pulseId ?? skipToken);
  const [updateSubscription] = useUpdateSubscriptionMutation();

  const handleArchive = async () => {
    if (pulseId && pulseQuery.data) {
      const result = await updateSubscription({
        ...pulseQuery.data,
        archived: true,
      });
      sendToast(
        result.error
          ? { message: t`Failed to delete` }
          : {
              subject: t`subscription`,
              verb: t`deleted`,
              action: () =>
                updateSubscription({ id: pulseId, archived: false }),
            },
      );
      if (!result.error) {
        props.onClose();
      }
    }
  };

  return (
    <LoadingAndErrorWrapper
      loading={pulseQuery.isLoading}
      error={pulseQuery.error ?? (pulseId === null && t`Not found.`)}
      noWrapper
    >
      <ArchiveModal
        item={pulseQuery.data}
        type="pulse"
        user={currentUser}
        hasUnsubscribed={hasUnsubscribed}
        onArchive={handleArchive}
        onClose={props.onClose}
      />
    </LoadingAndErrorWrapper>
  );
};
