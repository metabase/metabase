import { t } from "ttag";

import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";

const { fontFamilyMonospace } = getThemeOverrides();

export const SecretKeyModal = ({
  secretKey,
  onClose,
}: {
  secretKey: string;
  onClose: () => void;
}) => (
  <Modal
    size="30rem"
    opened
    onClose={onClose}
    title={t`Copy and save this API key`}
    data-testid="secret-key-modal"
  >
    <Stack gap="lg">
      <Text c="text-secondary">{t`Store this key somewhere safe. For security reasons, we can't show it to you again.`}</Text>
      <CopyTextInput
        aria-label={t`The API key`}
        size="sm"
        value={secretKey}
        readOnly
        styles={{
          input: {
            fontFamily: fontFamilyMonospace as string,
          },
        }}
      />
      <Group justify="flex-end">
        <Button onClick={onClose} variant="filled">{t`Done`}</Button>
      </Group>
    </Stack>
  </Modal>
);
