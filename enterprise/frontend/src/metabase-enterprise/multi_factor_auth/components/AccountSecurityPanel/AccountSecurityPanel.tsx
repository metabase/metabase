import { useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import { Box, Button, Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetMfaStatusQuery } from "metabase-enterprise/api";
import type { MfaStatus } from "metabase-types/api";

import { DisableModal } from "./DisableModal";
import { RecoveryCodesModal } from "./RecoveryCodesModal";
import { SetupModal } from "./SetupModal";

type SecurityModal = "setup" | "disable" | "recovery-codes";

export function AccountSecurityPanel() {
  const { data: status, isLoading, error } = useGetMfaStatusQuery();
  const [openedModal, setOpenedModal] = useState<SecurityModal | null>(null);
  const hasFeature = useHasTokenFeature("multi-factor-auth");
  const dispatch = useDispatch();

  const handleCloseModal = () => setOpenedModal(null);

  const handleDisableSuccess = () => {
    setOpenedModal(null);
    if (!hasFeature) {
      dispatch(push(Urls.accountSettings()));
    }
  };

  if (isLoading || error != null || status == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <>
      <MfaSection
        status={status}
        hasFeature={hasFeature}
        onOpenModal={setOpenedModal}
      />
      <SetupModal
        opened={openedModal === "setup"}
        onSuccess={handleCloseModal}
        onCancel={handleCloseModal}
      />
      <DisableModal
        opened={openedModal === "disable"}
        onSuccess={handleDisableSuccess}
        onCancel={handleCloseModal}
      />
      <RecoveryCodesModal
        opened={openedModal === "recovery-codes"}
        onSuccess={handleCloseModal}
        onCancel={handleCloseModal}
      />
    </>
  );
}

type MfaSectionProps = {
  status: MfaStatus;
  hasFeature: boolean;
  onOpenModal: (modal: SecurityModal) => void;
};

function MfaSection({ status, hasFeature, onOpenModal }: MfaSectionProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Stack gap="xs">
        <Box fw="bold" lh="1.25rem">{t`Two-factor authentication`}</Box>
        <Box c="text-secondary" lh="1.25rem">
          {status.enrolled
            ? t`Authenticator apps are enabled.`
            : t`Protect your account with a code from an authenticator app.`}
        </Box>
      </Stack>
      <Box>
        {status.enrolled ? (
          <Group gap="sm" wrap="nowrap">
            <Button onClick={() => onOpenModal("disable")}>{t`Disable`}</Button>
            <Button onClick={() => onOpenModal("recovery-codes")}>
              {t`Generate recovery codes`}
            </Button>
          </Group>
        ) : (
          <Button
            disabled={!hasFeature || !status.mfa_enabled}
            onClick={() => onOpenModal("setup")}
          >
            {t`Set up two-factor authentication`}
          </Button>
        )}
      </Box>
    </Group>
  );
}
