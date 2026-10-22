import cx from "classnames";
import type { JSX } from "react";

import { Box, Center, Icon } from "metabase/ui";

import S from "./InactiveStep.module.css";

interface InactiveStepProps {
  title: string;
  label: number;
  isStepCompleted: boolean;
}

export const InactiveStep = ({
  title,
  label,
  isStepCompleted,
}: InactiveStepProps): JSX.Element => {
  return (
    <Box
      component="section"
      pos="relative"
      py="lg"
      px="xxl"
      mb="xl"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      bg="background_page-primary"
      role="listitem"
      aria-label={title}
      data-testid="setup-step"
    >
      <Box
        c={isStepCompleted ? "feedback-positive" : "core-brand"}
        fz="lg"
        fw={700}
        my="sm"
      >
        {title}
      </Box>
      <Center
        className={cx(S.label, { [S.labelCompleted]: isStepCompleted })}
        c="core-brand"
        fw={700}
        lh={1}
      >
        {isStepCompleted ? (
          <Icon name="check" size="1rem" c="text-primary-inverse" />
        ) : (
          label
        )}
      </Center>
    </Box>
  );
};
