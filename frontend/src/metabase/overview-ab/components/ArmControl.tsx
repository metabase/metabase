import { t } from "ttag";

import { Group, Kbd, Radio, Select, Text, Tooltip } from "metabase/ui";

import type { Arm } from "../types";

type ArmOption = { value: string; label: string };

type ArmControlProps = {
  label: string;
  hotkey: string;
  arm: Arm;
  newId: string | undefined;
  newOptions: ArmOption[];
  onArmChange: (arm: Arm) => void;
  onNewIdChange: (id: string) => void;
  disabledReason?: string;
};

/** Baseline-vs-new radio plus a picker for which "new" variant to show. */
export function ArmControl({
  label,
  hotkey,
  arm,
  newId,
  newOptions,
  onArmChange,
  onNewIdChange,
  disabledReason,
}: ArmControlProps) {
  const isDisabled = disabledReason != null;
  const control = (
    <Group gap="xs" wrap="nowrap">
      <Text size="xs" fw="bold">
        {label}
      </Text>
      <Kbd size="xs">{hotkey.toUpperCase()}</Kbd>
      <Radio.Group
        size="xs"
        value={arm}
        onChange={(value) => onArmChange(value === "new" ? "new" : "baseline")}
        aria-label={label}
      >
        <Group gap="xs" wrap="nowrap">
          <Radio value="baseline" label={t`Baseline`} disabled={isDisabled} />
          <Radio
            value="new"
            label={t`New`}
            disabled={isDisabled || newOptions.length === 0}
          />
        </Group>
      </Radio.Group>
      <Select
        size="xs"
        w="11rem"
        data={newOptions}
        value={newId ?? null}
        disabled={isDisabled || newOptions.length === 0}
        onChange={(value) => value != null && onNewIdChange(value)}
        aria-label={t`${label} variant`}
        allowDeselect={false}
      />
    </Group>
  );

  return disabledReason ? (
    <Tooltip label={disabledReason}>
      <div>{control}</div>
    </Tooltip>
  ) : (
    control
  );
}
