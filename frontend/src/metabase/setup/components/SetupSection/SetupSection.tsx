import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Flex, Icon, UnstyledButton } from "metabase/ui";

import S from "./SetupSection.module.css";

interface SetupSectionProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

export const SetupSection = ({
  title,
  description,
  children,
}: SetupSectionProps): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Box className={S.root} mt="xl" pt="xl">
      <UnstyledButton
        w="100%"
        mb="xxl"
        aria-label={t`Setup section`}
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Flex align="center">
          <Box flex="1 1 auto" mr="xxl">
            <Box c="text-primary" fw={700}>
              {title}
            </Box>
            <Box c="text-secondary" mt="sm">
              {description}
            </Box>
          </Box>
          <ActionIcon component="span" radius="xl" size="lg">
            <Icon
              name={isExpanded ? "chevronup" : "chevrondown"}
              c="core-brand"
            />
          </ActionIcon>
        </Flex>
      </UnstyledButton>
      {isExpanded && children}
    </Box>
  );
};
