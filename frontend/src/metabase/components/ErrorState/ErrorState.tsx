import type React from "react";

import { Box, Flex, Text } from "metabase/ui";

interface ErrorStateProps {
  illustrationElement: React.ReactNode;
  message?: string;
  title?: string;
}

export const ErrorState = ({
  illustrationElement,
  message,
  title,
}: ErrorStateProps) => (
  <Flex direction="column" align="center">
    {illustrationElement && <Box>{illustrationElement}</Box>}
    {title && (
      <Text role="status" color="var(--mb-color-text-light)">
        {title}
      </Text>
    )}
    {message && (
      <Text role="status" color="light">
        {message}
      </Text>
    )}
  </Flex>
);
