import { c, t } from "ttag";

import { formatNumber } from "metabase/formatting";
import {
  Button,
  Group,
  Modal,
  type ModalProps,
  Stack,
  Text,
} from "metabase/ui";
import type { ICloudAddOnProduct } from "metabase-types/api";

const ROWS_BLOCK = 1_000_000;

type StoragePurchaseModalProps = Pick<ModalProps, "opened" | "onClose"> & {
  storageAddOn: ICloudAddOnProduct;
  onConfirm: () => void;
};

export const StoragePurchaseModal = ({
  opened,
  onClose,
  onConfirm,
  storageAddOn,
}: StoragePurchaseModalProps) => {
  const includedRows = formatNumber(storageAddOn.default_included_units, {
    compact: true,
    decimals: 0,
  });
  const additionalRows = formatNumber(ROWS_BLOCK, {
    compact: true,
    decimals: 0,
  });
  const pricePerBlock = formatNumber(
    storageAddOn.default_price_per_unit * ROWS_BLOCK,
    {
      number_style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  );

  const handleConfirm = () => {
    onClose();
    onConfirm();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="35rem"
      padding="2.5rem"
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins
      title={t`Add Metabase Storage`}
    >
      <Stack gap="md" mt="md">
        <Text>
          {t`Get secure, fully managed data storage where you can upload your CSVs and sync data from Google Sheets.`}
        </Text>

        <Text c="text-secondary" size="sm" lh={1.4}>
          {c(
            "{0} and {2} are numbers of database rows, {1} is a monthly price, e.g. '$40'",
          )
            /* prettier-ignore */
            // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins
            .t`By clicking "Add Metabase Storage," you agree to be charged in accordance with our terms of service. You will not be charged until you reach ${includedRows} stored rows, after which it's ${pricePerBlock}/mo. for each additional ${additionalRows} rows.`}
        </Text>

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>
            {t`Cancel`}
          </Button>
          <Button variant="filled" onClick={handleConfirm}>
            {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins */}
            {t`Add Metabase Storage`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
