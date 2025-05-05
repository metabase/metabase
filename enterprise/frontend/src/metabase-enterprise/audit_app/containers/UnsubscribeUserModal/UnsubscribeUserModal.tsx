import { t } from "ttag";

import { useGetUserQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { AuditApi } from "metabase-enterprise/services";
import type { User } from "metabase-types/api";

import { UnsubscribeUserForm } from "../../components/UnsubscribeUserForm";

interface UnsubscribeUserModal {
  params: { userId: string };
  onClose: () => void;
}

export const UnsubscribeUserModal = (props: UnsubscribeUserModal) => {
  const userId = parseInt(props.params.userId, 10);
  const { data: user, isLoading, error } = useGetUserQuery(userId);

  const dispatch = useDispatch();

  const onUnsubscribe = async ({ id }: User) => {
    await AuditApi.unsubscribe_user({ id });
    dispatch(addUndo({ message: t`Unsubscribe successful` }));
  };

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      {user && (
        <UnsubscribeUserForm
          {...props}
          user={user}
          onUnsubscribe={onUnsubscribe}
        />
      )}
    </LoadingAndErrorWrapper>
  );
};
