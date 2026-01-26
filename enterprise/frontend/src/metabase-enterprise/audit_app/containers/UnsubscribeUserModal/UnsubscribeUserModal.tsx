import { useState } from "react";
import { t } from "ttag";

import { useGetUserQuery } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks/use-toast";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { Stack, Text } from "metabase/ui";
import { AuditApi } from "metabase-enterprise/services";
import type { User } from "metabase-types/api";

interface UnsubscribeUserModal {
  params: { userId: string };
  onClose: () => void;
}

export const UnsubscribeUserModal = ({
  params,
  onClose,
}: UnsubscribeUserModal) => {
  const userId = parseInt(params.userId, 10);
  const { data: user, isLoading, error } = useGetUserQuery(userId);

  const [sendToast] = useToast();

  const [errorMessage, setErrorMessage] = useState<string>();
  const baseModalProps = {
    opened: true,
    onClose,
    title: "",
    errorMessage,
    confirmButtonText: t`Unsubscribe`,
  };

  const handleConfirmClick = async (user: User) => {
    try {
      await AuditApi.unsubscribe_user({ id: user.id });
      sendToast({ message: t`Unsubscribe successful` });
      onClose();
    } catch (error) {
      const msg = getResponseErrorMessage(error);
      setErrorMessage(msg ?? t`Unknown error encountered`);
    }
  };

  if (isLoading || error || !user) {
    return (
      <ConfirmModal
        {...baseModalProps}
        confirmButtonProps={{ disabled: true }}
        message={<LoadingAndErrorWrapper loading={isLoading} error={error} />}
      />
    );
  }

  return (
    <ConfirmModal
      {...baseModalProps}
      onConfirm={() => handleConfirmClick(user)}
      title={t`Unsubscribe ${user.common_name} from all subscriptions and alerts?`}
      message={
        <Stack gap="md">
          <Text>
            {t`This will delete any dashboard subscriptions or alerts ${user.common_name} has created, and remove them as a recipient from any other subscriptions or alerts.`}
          </Text>
          <Text>
            {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
            {t`This does not affect email distribution lists that are managed outside of Metabase.`}
          </Text>
        </Stack>
      }
    />
  );
};
