import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { usePurchaseCloudAddOnMutation } from "metabase/api/cloud-add-ons";
import { useMetadataToasts } from "metabase/metadata/hooks/useMetadataToasts";
import {
  Button,
  Group,
  List,
  Modal,
  type ModalProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { reload } from "metabase/utils/dom";
import { formatNumber } from "metabase/utils/formatting";
import type { ICloudAddOnProduct } from "metabase-types/api";

import { StorageSettingUpModal } from "./StorageSettingUpModal";
import { STORAGE_PRODUCT_TYPE } from "./use-storage-billing";

const ROWS_PER_UNIT = 1_000_000;

type StoragePurchaseModalProps = Pick<ModalProps, "opened" | "onClose"> & {
  storageAddOn: ICloudAddOnProduct;
};

export const StoragePurchaseModal = ({
  opened,
  onClose,
  storageAddOn,
}: StoragePurchaseModalProps) => {
  const [settingUpOpened, settingUpHandlers] = useDisclosure(false);
  const { sendErrorToast } = useMetadataToasts();
  const [purchaseCloudAddOn, { isLoading: isPurchasing }] =
    usePurchaseCloudAddOnMutation();

  const handlePurchase = useCallback(async () => {
    settingUpHandlers.open();
    try {
      await purchaseCloudAddOn({ product_type: STORAGE_PRODUCT_TYPE }).unwrap();
      // On success the setting-up modal polls for the `attached_dwh` token feature, then the user
      // reloads from there. Errors fall back to a toast.
    } catch {
      settingUpHandlers.close();
      sendErrorToast(
        t`It looks like something went wrong. Please refresh the page and try again.`,
      );
    }
  }, [purchaseCloudAddOn, sendErrorToast, settingUpHandlers]);

  const pricePerUnit = formatNumber(
    (storageAddOn.default_price_per_unit ?? 0) * ROWS_PER_UNIT,
    {
      number_style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  );

  return (
    <>
      <Modal
        opened={opened && !settingUpOpened}
        onClose={onClose}
        size="30rem"
        padding="2.5rem"
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins
        title={t`Add Metabase Storage`}
      >
        <Stack gap="md" mt="md">
          <Title order={3} size="md">
            {t`1M stored rows included for free`}
          </Title>
          <Text c="text-secondary">
            {t`After that, ${pricePerUnit} per 1M of stored rows will be added to your bill. You only pay for what you use.`}
          </Text>

          <List size="sm" withPadding>
            {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins */}
            <List.Item>{t`Secure, fully managed by Metabase`}</List.Item>
            <List.Item>{t`Upload CSV files`}</List.Item>
            <List.Item>{t`Sync with Google Sheets`}</List.Item>
          </List>

          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              variant="filled"
              loading={isPurchasing}
              onClick={handlePurchase}
            >
              {t`Add storage`}
            </Button>
          </Group>

          <Text c="text-secondary" size="sm" lh={1.4}>
            {t`By clicking Add storage, you agree to be charged in accordance with our terms of service. You will not be charged until you reach 1M stored rows.`}
          </Text>
        </Stack>
      </Modal>

      <StorageSettingUpModal
        opened={settingUpOpened}
        onClose={() => {
          settingUpHandlers.close();
          reload();
        }}
      />
    </>
  );
};
