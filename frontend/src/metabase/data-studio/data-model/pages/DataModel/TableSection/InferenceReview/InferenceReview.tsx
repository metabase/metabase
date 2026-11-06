import type { ReactNode } from "react";
import { t } from "ttag";

import { Button, Group, Icon, Text, Tooltip } from "metabase/ui";

/** A brand-blue AI icon after an inferred value, explaining the guess on hover */
export function InferredIcon({ description }: { description: string | null }) {
  if (description == null) {
    return null;
  }
  return (
    <Tooltip label={description} maw={280} multiline>
      <Icon name="ai" c="core-brand" aria-label={description} flex="0 0 auto" />
    </Tooltip>
  );
}

/**
 * The one pattern for a value sync inferred and an admin hasn't confirmed:
 * the value with the AI icon to its right, then Confirm and Change. Either
 * choice records it as the admin's, so the caller swaps in its normal input;
 * Change also opens it. Blank values aren't shown this way: there's nothing
 * to confirm, so callers show their input.
 */
export function InferredValue({
  value,
  inference,
  readOnly = false,
  isInset = true,
  onConfirm,
  onChange,
  "data-testid": dataTestId,
}: {
  value: ReactNode;
  /** Why sync guessed it, on the AI icon */
  inference: string | null;
  /** Shows the guess without the buttons */
  readOnly?: boolean;
  /** Pads like a filled cell's input; off inside a cell that pads itself */
  isInset?: boolean;
  onConfirm: () => void;
  /** Confirms, then opens the input so another value can be picked */
  onChange: () => void;
  "data-testid"?: string;
}) {
  return (
    <Group
      flex={1}
      justify="space-between"
      gap="sm"
      wrap="nowrap"
      px={isInset ? "lg" : 0}
      py={isInset ? "sm" : 0}
      data-testid={dataTestId}
    >
      <Group gap="xs" wrap="nowrap" miw={0}>
        {typeof value === "string" ? <Text truncate>{value}</Text> : value}
        <InferredIcon description={inference} />
      </Group>
      {!readOnly && (
        <InferredActions onConfirm={onConfirm} onChange={onChange} />
      )}
    </Group>
  );
}

/**
 * Confirm and Change for an inferred value. Inside `InferredValue` they sit to
 * the right; under a radio group, where the options already show the choice,
 * callers place them below it.
 */
export function InferredActions({
  onConfirm,
  onChange,
}: {
  onConfirm: () => void;
  onChange: () => void;
}) {
  return (
    <Group gap="xs" wrap="nowrap" flex="0 0 auto">
      <Button size="compact-sm" variant="filled" onClick={onConfirm}>
        {t`Confirm`}
      </Button>
      <Button size="compact-sm" onClick={onChange}>
        {t`Change`}
      </Button>
    </Group>
  );
}
