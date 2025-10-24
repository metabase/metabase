import { t } from "ttag";

import { BenchPaneHeader } from "metabase/bench/components/BenchPaneHeader";
import { BenchTabs } from "metabase/bench/components/shared/BenchTabs";
import { Button, Group, Tooltip } from "metabase/ui";

type TransformHeaderProps = {
  saveButtonLabel?: string;
  saveButtonTooltip?: string;
  canSave?: boolean;
  hasButtons?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
};

export function TransformHeader({
  saveButtonLabel,
  saveButtonTooltip,
  canSave,
  hasButtons,
  onSave,
  onCancel,
}: TransformHeaderProps) {
  return (
    <BenchPaneHeader
      title={
        <BenchTabs tabs={[{ label: t`Query`, to: `/bench/transforms/1` }]} />
      }
      actions={
        <Group>
          {hasButtons && <Button onClick={onCancel}>{t`Cancel`}</Button>}
          {hasButtons && (
            <Tooltip
              label={saveButtonTooltip}
              disabled={saveButtonTooltip == null}
            >
              <Button onClick={onSave} variant="filled" disabled={!canSave}>
                {saveButtonLabel}
              </Button>
            </Tooltip>
          )}
        </Group>
      }
    />
  );
}
