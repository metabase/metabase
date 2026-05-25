import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { Box, Flex, Text } from "metabase/ui";

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
    <Box className={S.root} mt="lg" pt="lg">
      <Flex align="center" mb="xl">
        <Box flex="1 1 auto" mr="xl">
          <Text c="text-primary" fw={700}>
            {title}
          </Text>
          <Text c="text-secondary" mt="sm">
            {description}
          </Text>
        </Box>
        <Button
          className={S.button}
          round
          icon={isExpanded ? "chevronup" : "chevrondown"}
          aria-label={t`Setup section`}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
        />
      </Flex>
      {isExpanded && children}
    </Box>
  );
};
