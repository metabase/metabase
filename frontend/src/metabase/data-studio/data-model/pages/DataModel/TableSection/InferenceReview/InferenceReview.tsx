import { t } from "ttag";

import { Badge, Button, Group, Icon, Text, Tooltip } from "metabase/ui";

/** Marks a weak guess an admin hasn't confirmed or changed yet */
export function NeedsReviewBadge() {
  return (
    <Badge color="warning" variant="light" flex="0 0 auto">
      {t`Needs review`}
    </Badge>
  );
}

/** An AI icon for an inferred value, explained on hover */
export function InferredIcon({ description }: { description: string | null }) {
  if (description == null) {
    return null;
  }
  return (
    <Tooltip label={description} maw={280} multiline>
      <Icon
        name="ai"
        c="text-secondary"
        aria-label={description}
        flex="0 0 auto"
      />
    </Tooltip>
  );
}

/**
 * A weak guess as plain text with its AI icon, to confirm or change.
 * Either choice records it as the admin's, so the caller swaps in its input.
 */
export function ReviewValue({
  value,
  inference,
  onConfirm,
  onChange,
  "data-testid": dataTestId,
}: {
  value: string;
  /** Why sync guessed it, shown on the AI icon */
  inference: string | null;
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
      px="lg"
      py="sm"
      data-testid={dataTestId}
    >
      <Group gap="xs" wrap="nowrap" miw={0}>
        <Text truncate>{value}</Text>
        <InferredIcon description={inference} />
      </Group>
      <Group gap="xs" wrap="nowrap" flex="0 0 auto">
        <Button size="compact-sm" variant="filled" onClick={onConfirm}>
          {t`Confirm`}
        </Button>
        <Button size="compact-sm" onClick={onChange}>
          {t`Change`}
        </Button>
      </Group>
    </Group>
  );
}
