import { t } from "ttag";

import { Button, Flex, Icon } from "metabase/ui";

export type ChartSettingsFooterProps = {
  onDone: () => void;
  onCancel: () => void;
  onReset: (() => void) | null;
};

export const ChartSettingsFooter = ({
  onDone,
  onCancel,
  onReset,
}: ChartSettingsFooterProps) => (
  <Flex justify="flex-end" gap="md" py="md" px="xl">
    {onReset && (
      <Button
        variant="subtle"
        color="text-secondary"
        leftSection={<Icon name="refresh" />}
        onClick={onReset}
      >{t`Reset to defaults`}</Button>
    )}
    <Button onClick={onCancel}>{t`Cancel`}</Button>
    <Button variant="filled" onClick={onDone}>{t`Done`}</Button>
  </Flex>
);
