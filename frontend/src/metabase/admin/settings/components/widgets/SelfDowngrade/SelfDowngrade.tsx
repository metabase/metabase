import { useDisclosure } from "@mantine/hooks";
import { c, t } from "ttag";

import { useGetRollbackAvailabilityQuery } from "metabase/api";
import { useStartUpgrade } from "metabase/status/hooks/self-upgrade";
import { Anchor, Text } from "metabase/ui";
import { versionToNumericComponents } from "metabase/utils/version";

import { SelfDowngradeConfirmModal } from "./SelfDowngradeConfirmModal";

export function SelfDowngrade({ currentVersion }: { currentVersion: string }) {
  const canVerifyVersion = versionToNumericComponents(currentVersion) != null;
  const { data: isAvailable, isError } = useGetRollbackAvailabilityQuery(
    undefined,
    {
      skip: !canVerifyVersion,
      refetchOnMountOrArgChange: true,
    },
  );
  const [isConfirmOpened, { open: openConfirm, close: closeConfirm }] =
    useDisclosure(false);
  const { start, isDisabled } = useStartUpgrade();

  if (!isAvailable || isError || !canVerifyVersion) {
    return null;
  }

  const link = (
    <Anchor
      key="downgrade"
      component="button"
      type="button"
      c="inherit"
      inherit
      underline="always"
      disabled={isDisabled}
      onClick={openConfirm}
    >
      {t`click here`}
    </Anchor>
  );
  const message = c("{0} is a link to downgrade")
    .jt`If you want to downgrade to your previous version, ${link}`;

  const handleConfirm = () => {
    closeConfirm();
    start({ operation: "downgrade", currentVersion });
  };

  return (
    <>
      <Text c="inherit" fw="normal" size="sm" mt="sm">
        {message}
      </Text>
      <SelfDowngradeConfirmModal
        opened={isConfirmOpened}
        onConfirm={handleConfirm}
        onClose={closeConfirm}
      />
    </>
  );
}
