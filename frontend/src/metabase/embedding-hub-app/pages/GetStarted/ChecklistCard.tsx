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
  /** Rendered muted and inert — the step's prerequisite is not met yet. */
  isLocked?: boolean;
  /** Names the prerequisite, shown on hover while locked. */
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

  const card = (
    <Card
      p="md"
      withBorder
      className={isInteractive ? S.interactiveCard : undefined}
      component={isInteractive && to != null ? ForwardRefLink : undefined}
      to={isInteractive ? to : undefined}
      onClick={isInteractive ? onClick : undefined}
      data-testid="embedding-hub-checklist-card"
      aria-disabled={isLocked || undefined}
    >
      <Stack gap="sm" h="100%" justify="space-between">
        {/* The description sits in the same column as the title, indented past
            the icon, rather than starting back at the icon's edge. */}
        <Group gap="sm" align="flex-start" wrap="nowrap">
          {/* FixedSizeIcon, not Icon: as a flex child next to the text the
              plain icon shrinks below its declared size. */}
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

            {/* md is the theme's 14px, which is the design's body size. */}
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
          <StepBadge step={step} isDone={isDone} isLocked={isLocked} />
        </Flex>
      </Stack>
    </Card>
  );

  // "Complete the other steps to unlock" named nothing. The prerequisite is
  // always a specific step, so say which one.
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
