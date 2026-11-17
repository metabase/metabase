import { t } from "ttag";

import {
  TRANSITION_KINDS,
  type TransitionKind,
  getTransitionKindLabel,
} from "metabase/metadata/lifecycle";
import { Select } from "metabase/ui";

import type { TransitionRow } from "./use-process-model";

/** A move's kind in the diagram's panel */
export function TransitionKindValue({
  row,
  disabled,
  onChange,
}: {
  row: TransitionRow;
  disabled: boolean;
  onChange: (kind: TransitionKind) => void;
}) {
  return (
    <Select
      aria-label={t`Transition from ${row.from} to ${row.to}`}
      data={TRANSITION_KINDS.map((kind) => ({
        value: kind,
        label: getTransitionKindLabel(kind),
      }))}
      value={row.resolvedKind}
      allowDeselect={false}
      disabled={disabled}
      onChange={(value) => {
        const kind = TRANSITION_KINDS.find((known) => known === value);
        if (kind) {
          onChange(kind);
        }
      }}
    />
  );
}
