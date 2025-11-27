import { t } from "ttag";

import {
  skipToken,
  useGetSubscriptionQuery,
  useUnsubscribeMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import { navigateToArchive } from "../../actions";
import UnsubscribeModal from "../../components/UnsubscribeModal";
import { getPulseId } from "../../selectors";

export const UnsubscribePulseModal = (props: {
  params: { pulseId?: string };
}) => {
  const pulseId = getPulseId(props);

  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const currentUser = useSelector(getUser);

  const pulseQuery = useGetSubscriptionQuery(pulseId ?? skipToken);
  const [unsubscribe] = useUnsubscribeMutation();

  const handleArchive = () => dispatch(navigateToArchive());
  const handleUnsubscribe = async () => {
    if (pulseId) {
      const result = await unsubscribe(pulseId);
      sendToast({
        message: result.error
          ? t`Failed to unsubscribe`
          : t`Successfully unsubscribed`,
      });
    }
  };

  return (
    <LoadingAndErrorWrapper
      loading={pulseQuery.isLoading}
      error={pulseQuery.error ?? (pulseId === null && t`Not found.`)}
      noWrapper
    >
      <UnsubscribeModal
        item={pulseQuery.data}
        type="pulse"
        user={currentUser}
        onArchive={handleArchive}
        onUnsubscribe={handleUnsubscribe}
      />
    </LoadingAndErrorWrapper>
  );
};
