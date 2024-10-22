import { t } from "ttag";

import Button from "metabase/core/components/Button";

import { ChartSettingsFooterRoot } from "./ChartSettings.styled";

export const ChartSettingsFooter = ({
  onDone,
  onCancel,
  onReset,
}: {
  onDone: () => void;
  onCancel: () => void;
  onReset: (() => void) | null;
}) => (
  <ChartSettingsFooterRoot>
    {onReset && (
      <Button
        borderless
        icon="refresh"
        onClick={onReset}
      >{t`Reset to defaults`}</Button>
    )}
    <Button onClick={onCancel}>{t`Cancel`}</Button>
    <Button primary onClick={onDone}>{t`Done`}</Button>
  </ChartSettingsFooterRoot>
);
