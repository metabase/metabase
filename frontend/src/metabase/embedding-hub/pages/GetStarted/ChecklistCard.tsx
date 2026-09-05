import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  Card,
  FixedSizeIcon,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./GetStarted.module.css";

export type ChecklistCardProps = {
  /** Position in the checklist, shown in the badge. */
  step: number;
  icon: IconName;
  title: string;
  description: string;
  isDone?: boolean;
  /** Either disabled on OSS, or waiting on another step to be completed. */
  isLocked?: boolean;
  /** Why it is locked, shown on hover. */
  lockedReason?: string;
  to?: string;
  onClick?: () => void;
};

export function ChecklistCard({
  step,
  icon,
  title,
  description,
  isDone = false,
  isLocked = false,
  lockedReason,
  to,
  onClick,
}: ChecklistCardProps) {
  const textColor = isLocked ? "text-tertiary" : "text-primary";
  const isInteractive = !isLocked && (to != null || onClick != null);

  const content = (
    <Stack gap="sm" h="100%" justify="space-between">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <FixedSizeIcon
          name={icon}
          size={16}
          c={isLocked ? "text-tertiary" : "brand"}
          mt="0.15rem"
        />

        <Stack gap="sm">
          <Text fw="bold" fz="lg" lh="md" c={textColor}>
            {title}
          </Text>

          <Text
            fz="md"
            lh="lg"
            c={isLocked ? "text-tertiary" : "text-secondary"}
          >
            {description}
          </Text>
        </Stack>
      </Group>

      <Flex justify="flex-end">
        <StepBadge
          step={step}
          isDone={isDone && !isLocked}
          isLocked={isLocked}
        />
      </Flex>
    </Stack>
  );

  let card;

  if (isInteractive && to != null) {
    card = (
      <Card
        p="lg"
        withBorder
        className={S.interactiveCard}
        component={ForwardRefLink}
        to={to}
        aria-label={title}
        data-testid="embedding-hub-checklist-card"
      >
        {content}
      </Card>
    );
  } else if (isInteractive) {
    card = (
      // A plain "button" string, not `component={UnstyledButton}`: Card's
      // polymorphic typing (unlike Flex's, which is what AreaTab uses) does
      // not resolve UnstyledButton's own props through the `component` prop,
      // so `onClick` is rejected at the type level. The global button reset
      // (`reset.module.css`) already strips native button chrome, so this
      // renders identically to UnstyledButton would have.
      <Card
        component="button"
        type="button"
        p="lg"
        withBorder
        // The global button reset does not cover text-align, so without this a
        // native button centres the card's text.
        ta="left"
        className={S.interactiveCard}
        onClick={onClick}
        aria-label={title}
        data-testid="embedding-hub-checklist-card"
      >
        {content}
      </Card>
    );
  } else {
    // Locked, or given neither `to` nor `onClick`: a plain div, with no click target.
    card = (
      <Card
        p="lg"
        withBorder
        data-testid="embedding-hub-checklist-card"
        aria-disabled={isLocked || undefined}
      >
        {content}
      </Card>
    );
  }

  if (isLocked && lockedReason) {
    return (
      <Tooltip label={lockedReason} position="top" withArrow>
        {card}
      </Tooltip>
    );
  }

  return card;
}

function StepBadge({
  step,
  isDone,
  isLocked,
}: {
  step: number;
  isDone: boolean;
  isLocked: boolean;
}) {
  if (isDone) {
    return (
      <Flex
        className={S.badge}
        bg="background-success"
        aria-label={t`Step ${step} complete`}
      >
        <Icon name="check" size={14} c="success" />
      </Flex>
    );
  }

  return (
    <Flex className={S.badge}>
      <Text fw="bold" fz="md" c={isLocked ? "text-tertiary" : "brand"}>
        {step}
      </Text>
    </Flex>
  );
}
