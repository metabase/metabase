import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import { ChartSettingsFooterRoot } from "./ChartSettingsFooter.styled";

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
  <ChartSettingsFooterRoot>
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
  </ChartSettingsFooterRoot>
);
