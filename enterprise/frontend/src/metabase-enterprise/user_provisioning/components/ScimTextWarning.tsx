import { Box, FixedSizeIcon, Flex, Text } from "metabase/ui";

export const ScimTextWarning = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <Flex my=".25rem" gap="sm" align="start" c="text-secondary">
    <Box mt=".25rem">
      <FixedSizeIcon name="info" />
    </Box>
    <Text fz=".75rem">{children}</Text>
  </Flex>
);
