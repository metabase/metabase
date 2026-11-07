import { useState } from "react";
import { t } from "ttag";

import {
  TRANSITION_KINDS,
  type TransitionKind,
  getTransitionKindLabel,
} from "metabase/metadata/lifecycle";
import { Select } from "metabase/ui";

import { InferredValue } from "../InferenceReview";

import type { TransitionRow } from "./use-process-model";

/**
 * A move's kind in the diagram's panel: sync's guess with Confirm and
 * Change, or a picker once an admin has set it.
 */
export function TransitionKindValue({
  row,
  disabled,
  onChange,
}: {
  row: TransitionRow;
  disabled: boolean;
  onChange: (kind: TransitionKind) => void;
}) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);

  if (!row.isOverridden) {
    return (
      <InferredValue
        value={getTransitionKindLabel(row.kind)}
        inference={t`Inferred: ${row.signal}`}
        readOnly={disabled}
        isInset={false}
        onConfirm={() => onChange(row.kind)}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onChange(row.kind);
        }}
      />
    );
  }

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
      autoFocus={isSelectOpenOnMount}
      defaultDropdownOpened={isSelectOpenOnMount}
      onChange={(value) => {
        const kind = TRANSITION_KINDS.find((known) => known === value);
        if (kind) {
          onChange(kind);
        }
      }}
    />
  );
}
