import { t } from "ttag";

import { Button } from "metabase/common/components/Button";

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
        borderless
        icon="refresh"
        onClick={onReset}
      >{t`Reset to defaults`}</Button>
    )}
    <Button onClick={onCancel}>{t`Cancel`}</Button>
    <Button primary onClick={onDone}>{t`Done`}</Button>
  </ChartSettingsFooterRoot>
);
