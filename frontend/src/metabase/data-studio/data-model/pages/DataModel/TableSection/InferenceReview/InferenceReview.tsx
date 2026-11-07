import type { MouseEvent, ReactNode } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Group,
  Icon,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

/**
 * The brand-blue AI icon after an inferred value, explaining the guess on
 * hover. With `onConfirm` it's a button: clicking it accepts the guess.
 */
export function InferredIcon({
  description,
  onConfirm,
}: {
  description: string | null;
  onConfirm?: () => void;
}) {
  if (description == null) {
    return null;
  }
  if (onConfirm == null) {
    return (
      <Tooltip label={description} maw={280} multiline>
        <Icon
          name="ai"
          c="core-brand"
          aria-label={description}
          flex="0 0 auto"
        />
      </Tooltip>
    );
  }
  return (
    <Tooltip label={t`${description} Click to confirm.`} maw={280} multiline>
      <ActionIcon
        size="sm"
        variant="subtle"
        flex="0 0 auto"
        aria-label={t`Confirm: ${description}`}
        onClick={(event: MouseEvent) => {
          // Inside a select or a card, a confirm shouldn't also open it
          event.stopPropagation();
          onConfirm();
        }}
      >
        <Icon name="ai" c="core-brand" />
      </ActionIcon>
    </Tooltip>
  );
}

/**
 * The one pattern for a value sync inferred and an admin hasn't confirmed:
 * the value with the AI icon to its right. Clicking the icon confirms the
 * guess; clicking the value opens the caller's normal input to pick another.
 * Either records it as the admin's, so the caller swaps in that input. Blank
 * values aren't shown this way: there's nothing to confirm, so callers show
 * their input.
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
  /** Shows the guess without letting anyone confirm or change it */
  readOnly?: boolean;
  /** Pads like a filled cell's input; off inside a cell that pads itself */
  isInset?: boolean;
  onConfirm: () => void;
  /** Records the guess, then opens the input so another value can be picked */
  onChange: () => void;
  "data-testid"?: string;
}) {
  const valueNode =
    typeof value === "string" ? <Text truncate>{value}</Text> : value;

  if (readOnly) {
    return (
      <Group
        flex={1}
        miw={0}
        gap="xs"
        wrap="nowrap"
        px={isInset ? "lg" : 0}
        py={isInset ? "sm" : 0}
        data-testid={dataTestId}
      >
        {valueNode}
        <InferredIcon description={inference} />
      </Group>
    );
  }

  return (
    <Group
      flex={1}
      miw={0}
      gap="xs"
      wrap="nowrap"
      px={isInset ? "lg" : 0}
      py={isInset ? "sm" : 0}
      data-testid={dataTestId}
    >
      <UnstyledButton
        miw={0}
        aria-label={t`Change`}
        onClick={onChange}
        style={{ display: "flex" }}
      >
        {valueNode}
      </UnstyledButton>
      <InferredIcon description={inference} onConfirm={onConfirm} />
      {/* The rest of the cell opens the input too, with a picker's chevron */}
      <UnstyledButton
        flex={1}
        tabIndex={-1}
        aria-hidden
        onClick={onChange}
        style={{ display: "flex", justifyContent: "flex-end" }}
      >
        <Icon name="chevrondown" c="text-secondary" />
      </UnstyledButton>
    </Group>
  );
}
