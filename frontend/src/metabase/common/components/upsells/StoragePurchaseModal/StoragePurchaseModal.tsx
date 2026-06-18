import { t } from "ttag";

import {
  Box,
  Button,
  Flex,
  Loader,
  Modal,
  type ModalProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import databaseAdd from "./database-add.svg?component";
import { usePurchaseStorageAddOn } from "./use-purchase-storage-add-on";

type StoragePurchaseModalProps = Pick<ModalProps, "opened" | "onClose">;

export const StoragePurchaseModal = ({
  opened,
  onClose,
}: StoragePurchaseModalProps) => {
  const { state, isSettingUp, isPurchasing, isReady, handlePurchase, reset } =
    usePurchaseStorageAddOn();

  const handleClose = () => {
    reset();
    onClose?.();
  };

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins
  const modalTitle = t`Add Metabase Storage`;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="30rem"
      padding="2.5rem"
      title={isSettingUp ? undefined : modalTitle}
      withCloseButton={!isSettingUp}
      closeOnClickOutside={!isSettingUp}
    >
      {state === "initial" && (
        <InitialStep
          isPurchasing={isPurchasing}
          onPurchase={handlePurchase}
          onCancel={handleClose}
        />
      )}
      {state === "settingUp" && (
        <SettingUpStep isReady={isReady} onClose={handleClose} />
      )}
    </Modal>
  );
};

const StorageIcon = ({ settingUp = false }: { settingUp?: boolean }) => (
  <Box h={96} pos="relative" w={96}>
    <Box component={databaseAdd} />

    {settingUp && (
      <Flex
        bottom={0}
        align="center"
        direction="row"
        gap={0}
        justify="center"
        pos="absolute"
        right={0}
        wrap="nowrap"
        bg="white"
        fz={0}
        p="sm"
        ta="center"
        style={{
          borderRadius: "100%",
          boxShadow: `0 1px 6px 0 var(--mb-color-shadow)`,
        }}
      >
        <Loader size="xs" ml={1} mt={1} />
      </Flex>
    )}
  </Box>
);

type InitialStepProps = {
  isPurchasing: boolean;
  onPurchase: () => void;
  onCancel: () => void;
};

const InitialStep = ({
  isPurchasing,
  onPurchase,
  onCancel,
}: InitialStepProps) => (
  <Stack align="center" gap="lg" mt="md">
    <StorageIcon />

    <Text c="text-secondary" ta="center" lh={1.43}>
      {t`Get a fully managed data warehouse. Upload CSV files and sync with Google Sheets.`}
    </Text>

    <Stack w="100%" gap="sm">
      <Button variant="filled" loading={isPurchasing} onClick={onPurchase}>
        {t`Add storage`}
      </Button>
      <Button variant="outline" onClick={onCancel}>
        {t`Cancel`}
      </Button>
    </Stack>

    <Text c="text-secondary" size="sm" lh={1.4} ta="center">
      {t`By clicking Add storage, you agree to be charged in accordance with our terms of service. You will not be charged until you reach 1M stored rows.`}
    </Text>
  </Stack>
);

type SettingUpStepProps = {
  isReady: boolean;
  onClose: () => void;
};

const SettingUpStep = ({ isReady, onClose }: SettingUpStepProps) => {
  if (isReady) {
    return (
      <Stack align="center" gap="lg" my="4.5rem">
        <StorageIcon />

        <Box ta="center">
          <Title c="text-primary" fz="lg">
            {t`Storage is ready`}
          </Title>
          <Text c="text-secondary" fz="md" lh={1.43}>
            {t`You can now upload CSVs and sync Google Sheets.`}
          </Text>
        </Box>

        <Button variant="filled" size="md" onClick={onClose}>
          {t`Done`}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack align="center" gap="lg" my="4.5rem">
      <StorageIcon settingUp />

      <Box ta="center">
        <Title c="text-primary" fz="lg">
          {t`Setting up storage`}
        </Title>
        <Text c="text-secondary" fz="md" lh={1.43}>
          {t`This can take a few minutes.`}
        </Text>
      </Box>

      <Button variant="outline" size="md" onClick={onClose}>
        {t`Close`}
      </Button>
    </Stack>
  );
};
