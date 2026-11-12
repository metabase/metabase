import { skipToken } from "@reduxjs/toolkit/query/react";
import { useState } from "react";
import { t } from "ttag";

import { useGetSubscriptionQuery, useUnsubscribeMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import { FormMessage } from "metabase/forms";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { Box, Button, Modal, Text } from "metabase/ui";
import type { DashboardSubscription, User } from "metabase-types/api";

import { getArchiveUrl } from "../../actions";
import { getPulseId } from "../../selectors";

type UnsubscribePulseModalProps = {
  params: { pulseId?: string };
  onClose: () => void;
};

export function UnsubscribePulseModal({
  params,
  onClose,
}: UnsubscribePulseModalProps) {
  const pulseId = getPulseId({ params });
  const user = useSelector(getUser);

  const {
    data: pulse,
    isLoading,
    error,
  } = useGetSubscriptionQuery(pulseId ?? skipToken);

  if (!user) {
    return null;
  }

  return (
    <Modal
      opened
      size="lg"
      title={t`Confirm you want to unsubscribe`}
      onClose={onClose}
    >
      {isLoading || error || !pulse ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <UnsubscribePulseModalBody
          pulse={pulse}
          user={user}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

type UnsubscribePulseModalBodyProps = {
  pulse: DashboardSubscription;
  user: User;
  onClose: () => void;
};

function UnsubscribePulseModalBody({
  pulse,
  user,
  onClose,
}: UnsubscribePulseModalBodyProps) {
  const navigate = useNavigate();
  const [unsubscribe] = useUnsubscribeMutation();
  const [error, setError] = useState<unknown>();

  const handleUnsubscribeClick = async () => {
    try {
      await unsubscribe(pulse.id).unwrap();

      if (user.id === pulse.creator_id) {
        navigate(getArchiveUrl(pulse, "pulse", true));
      } else {
        onClose();
      }
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <Text>
        {t`You'll stop receiving this subscription from now on. `}
        {t`Depending on your organization's permissions you might need to ask a moderator to be re-added in the future.`}
      </Text>
      <Modal.Footer>
        {!!error && (
          <Box flex={1}>
            <FormMessage formError={error} noPadding />
          </Box>
        )}
        <Button onClick={onClose}>{t`I changed my mind`}</Button>
        <Button
          variant="filled"
          color="negative"
          onClick={handleUnsubscribeClick}
        >
          {t`Unsubscribe`}
        </Button>
      </Modal.Footer>
    </>
  );
}
