import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Input } from "metabase/ui";
import { useGetMfaStatusQuery } from "metabase-enterprise/api";

import { DisableModal } from "./DisableModal";
import { EnrollModal } from "./EnrollModal";
import { RecoveryCodesModal } from "./RecoveryCodesModal";

type SecurityModal = "enroll" | "disable" | "recovery-codes";

export function AccountSecurityPanel() {
  const { data: status } = useGetMfaStatusQuery();
  const [openedModal, setOpenedModal] = useState<SecurityModal | null>(null);

  const handleCloseModal = () => setOpenedModal(null);

  return (
    <>
      <Input.Wrapper
        label={t`Two-factor authentication`}
        description={
          status?.enrolled
            ? t`Your account is protected with a code from an authenticator app.`
            : t`Protect your account with a code from an authenticator app.`
        }
      >
        <Box mt="sm">
          {status?.enrolled ? (
            <Group gap="sm">
              <Button onClick={() => setOpenedModal("recovery-codes")}>
                {t`Generate new recovery codes`}
              </Button>
              <Button
                color="feedback-negative"
                onClick={() => setOpenedModal("disable")}
              >
                {t`Turn off two-factor authentication`}
              </Button>
            </Group>
          ) : (
            <Button onClick={() => setOpenedModal("enroll")}>
              {t`Set up two-factor authentication`}
            </Button>
          )}
        </Box>
      </Input.Wrapper>
      <EnrollModal
        opened={openedModal === "enroll"}
        onSuccess={handleCloseModal}
        onCancel={handleCloseModal}
      />
      <DisableModal
        opened={openedModal === "disable"}
        onSuccess={handleCloseModal}
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
