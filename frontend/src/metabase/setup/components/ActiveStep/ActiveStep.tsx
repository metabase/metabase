import cx from "classnames";
import type { JSX, ReactNode } from "react";

import { useSelector } from "metabase/redux";
import { getShouldShowStepNumber } from "metabase/setup";
import { Box, Center } from "metabase/ui";

import S from "./ActiveStep.module.css";

interface ActiveStepProps {
  title: string;
  label: number;
  children?: ReactNode;
  className?: string;
}

export const ActiveStep = ({
  title,
  label,
  children,
  className,
}: ActiveStepProps): JSX.Element => {
  const shouldShowStepNumber = useSelector(getShouldShowStepNumber);

  return (
    <Box
      component="section"
      className={cx(S.root, className)}
      pos="relative"
      mb="xl"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="sm"
      bg="background_page-primary"
      role="listitem"
      aria-label={title}
      aria-current="step"
      data-testid="setup-step"
    >
      <Box c="core-brand" fz="xl" fw={700} mb="sm">
        {title}
      </Box>

      {shouldShowStepNumber && (
        <Center
          className={S.label}
          c="core-brand"
          fw={700}
          lh={1}
          data-testid="step-number"
        >
          {label}
        </Center>
      )}

      {children}
    </Box>
  );
};
