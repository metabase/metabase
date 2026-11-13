import type { MouseEvent, ReactNode } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  ActionIcon,
  Group,
  Icon,
  Input,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

import S from "./InferenceReview.module.css";

const INPUT_CLASS_NAMES = { input: S.input };

/**
 * The brand-blue AI icon after an inferred value, explaining the guess on
 * hover. With `onConfirm` it's a button: clicking it accepts the guess.
 */
export function InferredIcon({
  description,
  onConfirm,
}: {
  /**
   * Why sync guessed it, written to follow "because" in "… chose this
   * because <it>.": a lowercase clause ("it has valid_from and valid_to
   * columns"), unless it opens with a name ("Created At is a date").
   */
  description: string | null;
  onConfirm?: () => void;
}) {
  const applicationName = useSelector(getApplicationName);
  if (description == null) {
    return null;
  }
  const explanation = t`${applicationName} chose this because ${description.trim().replace(/\.$/, "")}.`;
  if (onConfirm == null) {
    return (
      <Tooltip label={explanation} maw={280} multiline>
        <Icon
          name="ai"
          c="core-brand"
          aria-label={explanation}
          flex="0 0 auto"
        />
      </Tooltip>
    );
  }
  return (
    <Tooltip label={t`${explanation} Click to confirm.`} maw={280} multiline>
      <ActionIcon
        size="sm"
        variant="subtle"
        flex="0 0 auto"
        aria-label={t`Confirm: ${explanation}`}
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
 * Where an inferred value sits, matching the input it stands in for:
 * - `cell`: a details cell's borderless input, padded like one
 * - `bare`: a details cell that pads its own value
 * - `input`: a standalone, bordered input
 */
type InferredValueVariant = "cell" | "bare" | "input";

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
  variant = "cell",
  leftSection,
  onConfirm,
  onChange,
  "data-testid": dataTestId,
}: {
  value: ReactNode;
  /** Why sync guessed it, on the AI icon */
  inference: string | null;
  /** Shows the guess without letting anyone confirm or change it */
  readOnly?: boolean;
  variant?: InferredValueVariant;
  /** The icon the input shows before its value; `input` variant only */
  leftSection?: ReactNode;
  onConfirm: () => void;
  /** Records the guess, then opens the input so another value can be picked */
  onChange: () => void;
  "data-testid"?: string;
}) {
  const valueNode =
    typeof value === "string" ? <Text truncate>{value}</Text> : value;

  if (variant === "input") {
    // The input's own frame, so the guess still reads as an editable field
    return (
      <Input
        component="div"
        classNames={INPUT_CLASS_NAMES}
        leftSection={leftSection}
        leftSectionPointerEvents="none"
        rightSection={<Icon name="chevrondown" />}
        rightSectionPointerEvents="none"
        disabled={readOnly}
        onClick={readOnly ? undefined : onChange}
        data-testid={dataTestId}
      >
        <Group gap="xs" wrap="nowrap" miw={0}>
          {readOnly ? (
            valueNode
          ) : (
            <UnstyledButton
              miw={0}
              aria-label={t`Change`}
              onClick={(event: MouseEvent) => {
                // The field's own click opens the input already
                event.stopPropagation();
                onChange();
              }}
              style={{ display: "flex" }}
            >
              {valueNode}
            </UnstyledButton>
          )}
          <InferredIcon
            description={inference}
            onConfirm={readOnly ? undefined : onConfirm}
          />
        </Group>
      </Input>
    );
  }

  const isInset = variant === "cell";

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
